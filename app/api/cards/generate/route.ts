export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { dbConnect } from "../../../../src/lib/db";
import Card from "../../../../src/models/Card";

type FlashCard = { q: string; a: string };

function normalizeCards(raw: unknown, wanted: number): FlashCard[] {
  let arr: unknown = raw;
  if (!Array.isArray(arr)) return [];
  const out: FlashCard[] = [];
  for (const item of arr) {
    if (typeof item === "object" && item !== null) {
      const q = String((item as any).q ?? "").trim();
      const a = String((item as any).a ?? "").trim();
      if (q && a) out.push({ q, a });
    }
    if (out.length >= wanted) break;
  }
  return out;
}

export async function POST(req: NextRequest) {
  try {
    if (!process.env.BELTO_API_URL) {
      return NextResponse.json({ error: "NO_LLM_URL" }, { status: 500 });
    }
    await dbConnect();

    const body = await req.json().catch(() => ({} as any));
    const deckId: string | undefined = body.deckId;
    const source: string = String(body.source ?? "");
    const countInput = Number(body.count ?? 10);
    const count = Math.max(1, Math.min(50, isFinite(countInput) ? countInput : 10));

    if (!deckId) {
      return NextResponse.json({ error: "MISSING_DECK_ID" }, { status: 400 });
    }
    if (!source.trim()) {
      return NextResponse.json({ error: "EMPTY_SOURCE" }, { status: 400 });
    }

    // Prompt the LLM to return EXACT JSON
    const sys = 'Output strictly a JSON array of objects like [{"q":"...","a":"..."}]. No prose, no code fences.';
    const user = `From the text below, generate exactly ${count} high-quality flashcards as a compact JSON array.
- Each item must have keys "q" and "a".
- Keep answers concise (<= 120 chars) and factual.
- DO NOT include extra text.

TEXT:
${source}`;

    const r = await fetch(process.env.BELTO_API_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: process.env.BELTO_API_MODEL || "local",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user }
        ],
        max_tokens: 1024,
        temperature: 0.2,
      }),
    });

    if (!r.ok) {
      const t = await r.text().catch(() => "");
      return NextResponse.json({ error: "LLM_HTTP", status: r.status, detail: t.slice(0, 500) }, { status: 502 });
    }

    const j = await r.json().catch(() => ({}));
    const content: string = j?.choices?.[0]?.message?.content ?? "";

    let parsed: unknown = null;
    try {
      parsed = JSON.parse(content);
    } catch {
      // try fenced JSON
      const m = content.match(/```json([\s\S]*?)```/i) || content.match(/```([\s\S]*?)```/i);
      if (!m) {
        return NextResponse.json(
          { error: "AI_BAD_JSON", sample: content.slice(0, 400) },
          { status: 400 }
        );
      }
      try {
        parsed = JSON.parse(m[1]);
      } catch {
        return NextResponse.json(
          { error: "AI_BAD_JSON", sample: content.slice(0, 400) },
          { status: 400 }
        );
      }
    }

    const cards = normalizeCards(parsed, count);
    if (cards.length === 0) {
      return NextResponse.json(
        { error: "AI_ZERO_CARDS", sample: content.slice(0, 400) },
        { status: 400 }
      );
    }

    // Prepare docs
    const deckObjectId = new mongoose.Types.ObjectId(deckId);
    const now = new Date();
    const docs = cards.slice(0, count).map((c) => ({
      deckId: deckObjectId,
      q: c.q,
      a: c.a,
      ease: 2.5,
      interval: 0,
      due: now,
    }));

    // Insert with native driver for deterministic counts
    const col = mongoose.connection.db.collection("cards");
    const result = await col.insertMany(docs, { ordered: false });

    const insertedIds: Record<string, any> = (result as any)?.insertedIds ?? {};
    const insertedCount: number =
      typeof (result as any)?.insertedCount === "number"
        ? (result as any).insertedCount
        : Object.keys(insertedIds).length;

    if (insertedCount === 0) {
      return NextResponse.json(
        { error: "SAVE_ZERO", attempted: docs.length },
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
      { error: "GEN_SAVE_FAILED", detail: e?.message || String(e) },
      { status: 500 }
    );
  }
}
