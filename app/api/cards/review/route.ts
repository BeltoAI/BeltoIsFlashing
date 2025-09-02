export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "../../../../src/lib/db";
import Card from "../../../../src/models/Card";
import { scheduleNext } from "../../../../src/lib/srs";

export async function GET(req: NextRequest) {
  await dbConnect();
  const deckId = req.nextUrl.searchParams.get("deckId");
  if (!deckId) return NextResponse.json({ error: "deckId required" }, { status: 400 });
  const now = new Date();
  const card = await Card.findOne({ deckId, nextReview: { $lte: now } }).sort({ nextReview: 1 }).lean();
  return NextResponse.json(card || null);
}

export async function POST(req: NextRequest) {
  await dbConnect();
  const { cardId, ease }:{ cardId:string, ease:"again"|"good"|"easy" } = await req.json();
  if (!cardId || !ease) return NextResponse.json({ error: "cardId and ease required" }, { status: 400 });
  const c = await Card.findById(cardId);
  if (!c) return NextResponse.json({ error: "card not found" }, { status: 404 });
  const { newBox, next } = scheduleNext(c.box, ease);
  c.box = newBox;
  c.nextReview = next;
  await c.save();
  return NextResponse.json({ ok: true, nextReview: next, box: newBox });
}
