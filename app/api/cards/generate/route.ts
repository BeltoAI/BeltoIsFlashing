export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "../../../../src/lib/db";
import mongoose from "mongoose";

const MAX_SOURCE_CHARS = Number(process.env.MAX_SOURCE_CHARS ?? 8000);
const DEFAULT_MODEL = process.env.BELTO_API_MODEL || "local";
const API_URL = process.env.BELTO_API_URL;

function sanitizeJsonish(raw: string): string | null {
  if (!raw) return null;
  const fence = raw.match(/```json([\s\S]*?)```/i) || raw.match(/```([\s\S]*?)```/);
  let s = fence ? fence[1].trim() : raw.trim();
  s = s.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
  const first = s.indexOf("["); const last = s.lastIndexOf("]");
  if (first !== -1 && last !== -1 && last > first) s = s.slice(first, last + 1);
  s = s.replace(/,\s*([}\]])/g, "$1");
  const looksSingle = s.includes("'") && !s.includes('"');
  if (looksSingle) { const t = s.replace(/'/g, '"'); try { JSON.parse(t); return t; } catch {} }
  try { JSON.parse(s); return s; } catch { return null; }
}

function normalizeCards(arr: unknown, limit: number) {
  if (!Array.isArray(arr)) throw new Error("NOT_ARRAY");
  const out: { q: string; a: string }[] = [];
  for (const it of arr) {
    const q = typeof (it as any)?.q === "string" ? (it as any).q.trim() : null;
    const a = typeof (it as any)?.a === "string" ? (it as any).a.trim() : null;
    if (q && a) out.push({ q, a });
    if (out.length >= limit) break;
  }
  if (out.length === 0) throw new Error("EMPTY_AFTER_VALIDATE");
  return out;
}

export async function POST(req: NextRequest) {
  if (!API_URL) return NextResponse.json({ error: "BELTO_API_URL_MISSING" }, { status: 500 });

  const { deckId, source, count: _count } = await req.json();
  if (!deckId) return NextResponse.json({ error: "DECK_ID_REQUIRED" }, { status: 400 });
  if (!source || typeof source !== "string") return NextResponse.json({ error: "SOURCE_REQUIRED" }, { status: 400 });
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

  // Call upstream LLM
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
    if (!r.ok) return NextResponse.json({ error: "LLM_ERROR", status: r.status, body: j }, { status: 502 });
  } catch (e: any) {
    return NextResponse.json({ error: "LLM_FETCH_FAILED", detail: e?.message || String(e) }, { status: 502 });
  }

  // Extract & validate JSON
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

  // Persist using native driver for deterministic insertedCount
  await dbConnect();
  const deckObjectId = new mongoose.Types.ObjectId(deckId);
  const now = new Date();

  const docs = cards.map(c => ({
    deckId: deckObjectId,
    q: c.q,
    a: c.a,
    ease: 2.5,
    interval: 0,
    due: now,
  }));

  try {
    const col = mongoose.connection.db.collection("cards"); // model name 'Card' => collection 'cards'
    const result = await col.insertMany(docs, { ordered: false });
    const insertedIds = (result as any)?.insertedIds ?? {};
const insertedCount = (result as any)?.insertedCount ?? Object.keys(insertedIds).length;
const saved = insertedCount || 0;

    if (saved === 0) {
      return NextResponse.json(
        { error: "SAVE_ZERO", attempted: docs.length, reason: "insertedCount=0" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      deckId,
      attempted: docs.length,
      saved,
      cardIds: Object.values((result as any).insertedIds || {}).map(String),
    });
  } catch (e: any) {
    const msg = e?.message || String(e);
    const partial = ((e as any)?.result?.result?.nInserted ?? (e as any)?.result?.insertedCount ?? 0);
    return NextResponse.json(
      { error: "SAVE_FAILED", attempted: docs.length, inserted: partial ?? 0, detail: msg },
      { status: 500 }
    );
  }
}
