export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "../../../src/lib/db";
import Card from "../../../src/models/Card";

type InputCard = { q: string; a: string };

export async function GET(req: NextRequest) {
  await dbConnect();
  const deckId = req.nextUrl.searchParams.get("deckId");
  if (!deckId) return NextResponse.json({ error: "deckId required" }, { status: 400 });
  const cards = await Card.find({ deckId }).sort({ createdAt: -1 }).lean();
  return NextResponse.json(cards);
}

export async function POST(req: NextRequest) {
  await dbConnect();
  const { deckId, cards } = (await req.json()) as { deckId?: string; cards?: InputCard[] };
  if (!deckId || !Array.isArray(cards)) {
    return NextResponse.json({ error: "deckId and cards[] required" }, { status: 400 });
  }
  const created = await Card.insertMany(
    (cards as InputCard[]).map((c) => ({ deckId, question: c.q, answer: c.a }))
  );
  return NextResponse.json(created);
}
