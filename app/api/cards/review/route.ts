export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "../../../../src/lib/db";
import Card from "../../../../src/models/Card";
import { scheduleNext } from "../../../../src/lib/srs";

// GET: fetch next due card for a deck
export async function GET(req: NextRequest) {
  const deckId = req.nextUrl.searchParams.get("deckId");
  if (!deckId) return NextResponse.json({ error: "DECK_ID_REQUIRED" }, { status: 400 });

  await dbConnect();
  const now = new Date();
  const card = await Card.findOne({ deckId, due: { $lte: now } })
    .sort({ due: 1, createdAt: 1 })
    .lean();

  if (!card) return new NextResponse(null, { status: 204 }); // no due card
  return NextResponse.json({ card });
}

// POST: grade a card and reschedule
export async function POST(req: NextRequest) {
  const { cardId, grade } = await req.json();
  if (!cardId || !grade) {
    return NextResponse.json({ error: "CARD_ID_AND_GRADE_REQUIRED" }, { status: 400 });
  }

  await dbConnect();
  const card = await Card.findById(cardId);
  if (!card) return NextResponse.json({ error: "CARD_NOT_FOUND" }, { status: 404 });

  const { ease, interval, due } = scheduleNext({
    ease: card.ease,
    interval: card.interval,
    grade, // "again" | "hard" | "good" | "easy"
    now: new Date(),
  });

  card.ease = ease;
  card.interval = interval;
  card.due = due;
  card.set("lastReviewedAt", new Date());
  await card.save();

  return NextResponse.json({ ok: true, card: { _id: card._id, ease, interval, due } });
}
