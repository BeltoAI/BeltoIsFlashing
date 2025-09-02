export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/src/lib/db";
import Deck from "@/src/models/Deck";

export async function GET() {
  await dbConnect();
  const decks = await Deck.find({}).sort({ createdAt: -1 }).lean();
  return NextResponse.json(decks);
}

export async function POST(req: NextRequest) {
  await dbConnect();
  const { name } = await req.json();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  const deck = await Deck.create({ name });
  return NextResponse.json(deck);
}
