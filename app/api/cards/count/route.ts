export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { dbConnect } from "../../../../src/lib/db";
import Card from "../../../../src/models/Card";

export async function GET(req: NextRequest) {
  try {
    await dbConnect();
    const { searchParams } = new URL(req.url);
    const deckId = searchParams.get("deckId");
    if (!deckId) return NextResponse.json({ error: "MISSING_DECK" }, { status: 400 });
    const deckObjectId = new mongoose.Types.ObjectId(deckId);
    const now = new Date();
    const [total, dueNow] = await Promise.all([
      Card.countDocuments({ deckId: deckObjectId }),
      Card.countDocuments({ deckId: deckObjectId, due: { $lte: now } }),
    ]);
    return NextResponse.json({ total, dueNow });
  } catch (e:any) {
    return NextResponse.json({ error: "COUNT_FAILED", detail: e?.message || String(e) }, { status: 500 });
  }
}
