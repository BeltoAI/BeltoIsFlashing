export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "../../../../src/lib/db";
import Card from "../../../../src/models/Card";

const MAX_SOURCE_CHARS = Number(process.env.MAX_SOURCE_CHARS || 8000);

export async function POST(req: NextRequest) {
  try {
    const { source, count = 10, deckId } = await req.json();
    if (typeof source !== "string" || !source.trim()) {
      return NextResponse.json({ error: "SOURCE_REQUIRED" }, { status: 400 });
    }
    if (source.length > MAX_SOURCE_CHARS) {
      return NextResponse.json(
        { error: "SOURCE_TOO_LONG", max: MAX_SOURCE_CHARS, length: source.length },
        { status: 413 }
      );
    }

    const prompt = `From the text below, generate ${count} flashcards as compact Q/A JSON array with keys "q" and "a". Keep answers concise.\nTEXT:\n${source}`;

    // call your AI proxy
    const r = await fetch(process.env.BELTO_API_URL!, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: process.env.BELTO_API_MODEL || "local",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 512,
        temperature: 0.3,
      }),
    });
    if (!r.ok) {
      const text = await r.text().catch(()=>"");
      return NextResponse.json({ error: "AI_UPSTREAM", status: r.status, body: text.slice(0,500) }, { status: 502 });
    }
    const j = await r.json();
    const content: string = j?.choices?.[0]?.message?.content ?? "";

    let cards: Array<{ q: string; a: string }>;
    try {
      cards = JSON.parse(content);
      if (!Array.isArray(cards)) throw new Error("Not array");
    } catch {
      const m = content.match(/```json([\s\S]*?)```/i);
      if (!m) return NextResponse.json({ error: "AI_BAD_JSON", sample: String(content).slice(0,300) }, { status: 500 });
      cards = JSON.parse(m[1]);
    }

    if (deckId) {
      await dbConnect();
      const now = new Date();
      const docs = cards.map(c => ({
        deckId,
        q: c.q,
        a: c.a,
        due: now,
        ease: 2.5,
        interval: 0,
      }));
      await Card.insertMany(docs);
    }

    return NextResponse.json({ ok: true, saved: !!deckId, cards });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "SERVER_ERROR" }, { status: 500 });
  }
}
