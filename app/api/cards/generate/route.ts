export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { dbConnect } from "../../../../src/lib/db";
import Card from "../../../../src/models/Card";

type RawCard = { q?: any; a?: any; question?: any; answer?: any; front?: any; back?: any; prompt?: any; };
type CleanCard = { q: string; a: string };

function safeParse<T>(s: string): T | null {
  try { return JSON.parse(s); } catch { return null; }
}

function extractArray(text: string): any[] | null {
  if (!text) return null;
  const trimmed = text.trim();

  // 1) direct parse
  let arr = safeParse<any[]>(trimmed);
  if (Array.isArray(arr)) return arr;

  // 2) bracket slice
  const first = trimmed.indexOf("[");
  const last  = trimmed.lastIndexOf("]");
  if (first >= 0 && last > first) {
    arr = safeParse<any[]>(trimmed.slice(first, last + 1));
    if (Array.isArray(arr)) return arr;
  }

  // 3) normalize quotes + trailing commas
  const norm = trimmed
    .replace(/[\u201C\u201D\u2018\u2019]/g, '"')
    .replace(/,\s*([}\]])/g, "$1");
  arr = safeParse<any[]>(norm);
  if (Array.isArray(arr)) return arr;

  // 4) maybe { cards: [...] }
  const obj = safeParse<any>(norm);
  if (obj && Array.isArray(obj.cards)) return obj.cards;

  return null;
}

function normalize(items: RawCard[], cap: number): CleanCard[] {
  const mapped = items.map((it) => {
    const q = it.q ?? it.question ?? it.prompt ?? it.front ?? "";
    const a = it.a ?? it.answer ?? it.back ?? "";
    return { q: String(q || "").trim(), a: String(a || "").trim() };
  }).filter(c => c.q && c.a);
  return mapped.slice(0, Math.max(1, cap || mapped.length || 1));
}

export async function POST(req: NextRequest) {
  try {
    await dbConnect();
    const body = await req.json().catch(() => ({}));
    const deckId: string | undefined = body.deckId;
    const source: string = body.source || "";
    const count: number = Math.min(20, Math.max(1, Number(body.count || 5)));

    if (!deckId) {
      return NextResponse.json({ error: "MISSING_DECK_ID" }, { status: 400 });
    }
    if (!source.trim()) {
      return NextResponse.json({ error: "MISSING_SOURCE" }, { status: 400 });
    }

    // Call your local LLM proxy directly
    const r = await fetch(process.env.BELTO_API_URL!, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: process.env.BELTO_API_MODEL || "local",
        messages: [
          {
            role: "system",
            content:
              `Output strictly a JSON array of ${count} objects like ` +
              `[{"q":"...","a":"..."}]. No prose, no code fences, no preface, no trailing text.`
          },
          { role: "user", content: source }
        ],
        max_tokens: 512,
        temperature: 0.1
      }),
    });

    const j = await r.json().catch(() => ({} as any));
    const content: string = j?.choices?.[0]?.message?.content || "";

    const raw = extractArray(content);
    if (!Array.isArray(raw)) {
      return NextResponse.json(
        { error: "AI_BAD_JSON", sample: content?.slice(0, 500) },
        { status: 400 }
      );
    }

    const cards = normalize(raw as RawCard[], count);
    if (!cards.length) {
      return NextResponse.json({ error: "AI_ZERO" }, { status: 400 });
    }

    // Save using native collection for deterministic insertedCount
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

    const col = mongoose.connection.db.collection("cards");
    const result = await col.insertMany(docs, { ordered: false });
    const insertedIds = (result as any)?.insertedIds ?? {};
    const insertedCount = (result as any)?.insertedCount ?? Object.keys(insertedIds).length;

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
