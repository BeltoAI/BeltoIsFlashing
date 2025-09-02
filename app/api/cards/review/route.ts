export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { dbConnect } from "../../../../src/lib/db";
import Card from "../../../../src/models/Card";
import { scheduleNext } from "../../../../src/lib/srs";

export async function GET(req: NextRequest) {
  try {
    await dbConnect();
    const { searchParams } = new URL(req.url);
    const deckId = searchParams.get("deckId");
    if (!deckId) {
      return NextResponse.json({ error: "MISSING_DECK_ID" }, { status: 400 });
    }

    // Accept skip as comma-separated and/or repeated params
    const rawSkips = [
      ...searchParams.getAll("skip"),
      ...(searchParams.get("skip")?.split(",") || []),
    ];
    const skipIds = Array.from(
      new Set(
        rawSkips
          .map((s) => s.trim())
          .filter(Boolean)
          .filter(mongoose.isValidObjectId)
          .map((id) => new mongoose.Types.ObjectId(id))
      )
    );

    const query: any = {
      deckId: new mongoose.Types.ObjectId(deckId),
      due: { $lte: new Date() },
    };
    if (skipIds.length) query._id = { $nin: skipIds };

    const card = await Card.findOne(query).sort({ due: 1, _id: 1 }).lean();
    return NextResponse.json({ card: card ? { ...card, _id: String(card._id) } : null });
  } catch (e: any) {
    return NextResponse.json(
      { error: "REVIEW_LOAD_FAILED", detail: e?.message || String(e) },
      { status: 500 }
    );
  }
}

type Grade = "again" | "hard" | "good" | "easy";

export async function POST(req: NextRequest) {
  try {
    await dbConnect();
    const body = await req.json().catch(() => ({}));
    const cardId: string | undefined = body.cardId;
    const grade: Grade | undefined = body.grade;

    if (!cardId || !grade) {
      return NextResponse.json({ error: "MISSING_PARAMS", got: { cardId: !!cardId, grade } }, { status: 400 });
    }

    const existing = await Card.findById(cardId).lean();
    if (!existing) return NextResponse.json({ error: "NOT_FOUND", cardId }, { status: 404 });

    const { ease, interval, due } = scheduleNext({
      ease: existing.ease ?? 2.5,
      interval: existing.interval ?? 0,
      grade,
    });

    const r = await Card.updateOne(
      { _id: new mongoose.Types.ObjectId(cardId) },
      { $set: { ease, interval, due } },
      { runValidators: false } // don't re-validate q/a on updates
    );

    return NextResponse.json({ ok: true, modified: r.modifiedCount, nextDue: due });
  } catch (e: any) {
    return NextResponse.json({ error: "REVIEW_UPDATE_FAILED", detail: e?.message || String(e) }, { status: 500 });
  }
}
