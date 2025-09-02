export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { dbConnect } from "../../../../src/lib/db";
import Card from "../../../../src/models/Card";

type RawCard = Record<string, unknown>;
type QA = { q: string; a: string };

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function stripCodeFences(s: string) {
  const m = s.match(/```(?:json|javascript)?\s*([\s\S]*?)```/i);
  return m ? m[1] : s;
}

function firstBalancedJSONArray(s: string): string | null {
  const i = s.indexOf("[");
  if (i < 0) return null;
  let depth = 0;
  for (let j = i; j < s.length; j++) {
    const ch = s[j];
    if (ch === "[") depth++;
    if (ch === "]") {
      depth--;
      if (depth === 0) return s.slice(i, j + 1);
    }
  }
  return null;
}

function tryJSON<T = unknown>(s: string): T | null {
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

function normalizeOne(o: RawCard): QA | null {
  const q =
    o.q ?? o.Q ?? o.question ?? o.Question ?? o.front ?? o.prompt ?? o.term;
  const a =
    o.a ?? o.A ?? o.answer ?? o.Answer ?? o.back ?? o.definition ?? o.explanation;
  if (!q || !a) return null;
  const qq = String(q).trim();
  const aa = String(a).trim();
  if (!qq || !aa) return null;
  return { q: qq, a: aa };
}

function toQAArray(anything: unknown): QA[] {
  const arr = Array.isArray(anything) ? anything : [];
  return arr
    .map(normalizeOne)
    .filter((x): x is QA => !!x);
}

function extractCardsFromText(content: string): QA[] {
  if (!content || typeof content !== "string") return [];

  // 1) yank code fence if present
  let s = stripCodeFences(content).trim();

  // 2) if response is a JSON string (e.g. starts/ends with quotes), unquote once
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    const unq = tryJSON<string>(s);
    if (typeof unq === "string") s = unq.trim();
  }

  // 3) direct array?
  if (s.startsWith("[")) {
    const arr = tryJSON(s);
    if (arr) return toQAArray(arr);
  }

  // 4) find first balanced array anywhere
  const slice = firstBalancedJSONArray(s);
  if (slice) {
    const arr = tryJSON(slice);
    if (arr) return toQAArray(arr);
  }

  // 5) maybe object with { cards: [...] }
  const asObj = tryJSON<Record<string, unknown>>(s);
  if (asObj && Array.isArray((asObj as any).cards)) {
    return toQAArray((asObj as any).cards);
  }

  // 6) maybe the object itself is a stringified object containing cards
  if (typeof asObj === "string") {
    const nestedObj = tryJSON<Record<string, unknown>>(asObj);
    if (nestedObj && Array.isArray((nestedObj as any).cards)) {
      return toQAArray((nestedObj as any).cards);
    }
  }

  // 7) last-ditch: parse stringified array
  const asArray = tryJSON(s);
  if (Array.isArray(asArray)) return toQAArray(asArray);

  return [];
}

function buildPrompt(source: string, count: number) {
  // Keep it *very* explicit. Models love to “help”.
  return [
    {
      role: "system",
      content:
        "You are a JSON generator. Output ONLY a compact JSON array of objects with keys 'q' and 'a'. No prose. No code fences. Example: [{\"q\":\"Question\",\"a\":\"Answer\"}]",
    },
    {
      role: "user",
      content:
        `Create ${count} short flashcards from the following text/topic. Each item MUST be {"q": "...", "a": "..."}. ` +
        `Keep them concise, factual, and self-contained.\n\n=== SOURCE START ===\n${source}\n=== SOURCE END ===\n\n` +
        `OUTPUT: A raw JSON array, nothing else.`,
    },
  ];
}

export async function POST(req: NextRequest) {
  try {
    await dbConnect();
    const body = await req.json().catch(() => ({}));
    const deckId = String(body.deckId || "").trim();
    const source = String(body.source || "").trim();
    const count = clamp(Number(body.count || 5), 1, 50);

    if (!deckId || !mongoose.isValidObjectId(deckId)) {
      return NextResponse.json({ error: "MISSING_DECK_ID" }, { status: 400 });
    }
    if (!source) {
      return NextResponse.json({ error: "MISSING_SOURCE" }, { status: 400 });
    }

    // Call your local OpenAI-compatible proxy
    const r = await fetch(process.env.BELTO_API_URL!, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: process.env.BELTO_API_MODEL || "local",
        messages: buildPrompt(source, count),
        temperature: 0.2,
        max_tokens: 800,
        // Some proxies accept this; harmless if ignored.
        // response_format: { type: "json_object" },
      }),
    });

    const jr = await r.json().catch(() => ({} as any));
    const content: string =
      jr?.choices?.[0]?.message?.content ??
      jr?.choices?.[0]?.message ??
      jr?.content ??
      "";

    const cards = extractCardsFromText(String(content || "")).slice(0, count);

    if (!cards.length) {
      const sample =
        typeof content === "string"
          ? content.slice(0, 600)
          : JSON.stringify(jr).slice(0, 600);
      return NextResponse.json(
        { error: "AI_BAD_JSON", sample },
        { status: 400 }
      );
    }

    // Prepare docs
    const deckObjectId = new mongoose.Types.ObjectId(deckId);
    const now = new Date();
    const docs = cards.map((c) => ({
      deckId: deckObjectId,
      q: c.q,
      a: c.a,
      ease: 2.5,
      interval: 0,
      due: now,
    }));

    // Use native driver for deterministic counts
    const col = mongoose.connection.db.collection("cards");
    const result = await col.insertMany(docs, { ordered: false });
    const insertedIds = (result as any)?.insertedIds ?? {};
    const insertedCount =
      (result as any)?.insertedCount ?? Object.keys(insertedIds).length;

    if (!insertedCount) {
      return NextResponse.json(
        { error: "SAVE_ZERO", attempted: docs.length, reason: "insertedCount=0" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      deckId,
      attempted: docs.length,
      saved: insertedCount,
      cardIds: Object.values(insertedIds).map(String),
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: "GEN_FAILED", detail: e?.message || String(e) },
      { status: 500 }
    );
  }
}
