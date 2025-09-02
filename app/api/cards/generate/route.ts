export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "../../../../src/lib/db";
import Card from "../../../../src/models/Card";

const MAX_SOURCE_CHARS = Number(process.env.MAX_SOURCE_CHARS ?? 8000);
const DEFAULT_MODEL = process.env.BELTO_API_MODEL || "local";
const API_URL = process.env.BELTO_API_URL;

function sanitizeJsonish(raw: string): string | null {
  if (!raw) return null;

  // 1) prefer ```json ... ``` fence
  const fence = raw.match(/```json([\s\S]*?)```/i) || raw.match(/```([\s\S]*?)```/);
  let s = fence ? fence[1].trim() : raw.trim();

  // 2) normalize smart quotes -> ascii
  s = s.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");

  // 3) slice to the largest plausible JSON array region
  const first = s.indexOf("[");
  const last = s.lastIndexOf("]");
  if (first !== -1 && last !== -1 && last > first) {
    s = s.slice(first, last + 1);
  }

  // 4) remove trailing commas before } or ]
  s = s.replace(/,\s*([}\]])/g, "$1");

  // 5) if it still looks single-quoted JSON, try converting keys/values
  const looksSingleQuoted = s.includes("'") && !s.includes('"');
  if (looksSingleQuoted) {
    const attempt = s.replace(/'/g, '"');
    try { JSON.parse(attempt); return attempt; } catch {}
  }

  // Final attempt
  try { JSON.parse(s); return s; } catch { return null; }
}

function normalizeCards(arr: any, limit: number) {
  if (!Array.isArray(arr)) throw new Error("NOT_ARRAY");
  const out: { q: string; a: string }[] = [];
  for (const it of arr) {
    const q = typeof it?.q === "string" ? it.q.trim() : null;
    const a = typeof it?.a === "string" ? it.a.trim() : null;
    if (q && a) out.push({ q, a });
    if (out.length >= limit) break;
  }
  if (out.length === 0) throw new Error("EMPTY_AFTER_VALIDATE");
  return out;
}

export async function POST(req: NextRequest) {
  if (!API_URL) {
    return NextResponse.json({ error: "BELTO_API_URL_MISSING" }, { status: 500 });
  }

  const { deckId, source, count: _count } = await req.json();
  if (!deckId) return NextResponse.json({ error: "DECK_ID_REQUIRED" }, { status: 400 });
  if (!source || typeof source !== "string") {
    return NextResponse.json({ error: "SOURCE_REQUIRED" }, { status: 400 });
  }
  if (source.length > MAX_SOURCE_CHARS) {
    return NextResponse.json({ error: "SOURCE_TOO_LONG", length: source.length, max: MAX_SOURCE_CHARS }, { status: 400 });
  }

  const count = Math.min(Math.max(parseInt(_count ?? 10, 10) || 10, 1), 50);

  const sys = [
    "You are a flashcard generator.",
    "Return ONLY a minified JSON array: [{\"q\":\"...\",\"a\":\"...\"}].",
    "No code fences. No prose. No comments. Use double quotes. Keep answers concise."
  ].join(" ");
  const user = `From the text below, generate ${count} Q/A flashcards as JSON array with keys "q" and "a". Only output the JSON array.\nTEXT:\n${source}`;

  // Call upstream
  let content = "";
  try {
    const r = await fetch(API_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user },
        ],
        max_tokens: 1024,
        temperature: 0.2,
      }),
    });

    const j = await r.json().catch(() => ({}));
    content = j?.choices?.[0]?.message?.content ?? "";
    if (!r.ok) {
      return NextResponse.json({ error: "LLM_ERROR", status: r.status, body: j }, { status: 502 });
    }
  } catch (e: any) {
    return NextResponse.json({ error: "LLM_FETCH_FAILED", detail: e?.message || String(e) }, { status: 502 });
  }

  // Extract/parse robustly
  const cleaned = sanitizeJsonish(content);
  if (!cleaned) {
    return NextResponse.json(
      { error: "AI_BAD_JSON", hint: "Could not extract a JSON array from model output.", sample: content.slice(0, 400) },
      { status: 400 }
    );
  }

  let rawArr: unknown;
  try { rawArr = JSON.parse(cleaned); }
  catch {
    return NextResponse.json(
      { error: "AI_BAD_JSON", hint: "JSON.parse failed after sanitization.", sample: cleaned.slice(0, 400) },
      { status: 400 }
    );
  }

  let cards: { q: string; a: string }[];
  try { cards = normalizeCards(rawArr, count); }
  catch (e: any) {
    return NextResponse.json(
      { error: "AI_BAD_JSON", hint: e?.message || "Validation failed", sample: cleaned.slice(0, 400) },
      { status: 400 }
    );
  }

  // Persist
  await dbConnect();
  const now = new Date();
  const docs = await Card.insertMany(
    cards.map(c => ({
      deckId,
      q: c.q,
      a: c.a,
      ease: 2.5,
      interval: 0,
      due: now,
    })),
    { ordered: false }
  );

  return NextResponse.json({ ok: true, deckId, saved: docs.length, cards: docs.map(d => ({ _id: d._id })) });
}
