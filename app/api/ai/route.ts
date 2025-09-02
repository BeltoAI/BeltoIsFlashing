export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const r = await fetch(process.env.BELTO_API_URL!, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.BELTO_API_MODEL || "local",
        messages: body.messages,
        max_tokens: body.max_tokens ?? 256,
        temperature: body.temperature ?? 0.2
      }),
    });

    if (!r.ok) {
      const text = await r.text().catch(() => "");
      return NextResponse.json({ error: text || r.statusText }, { status: r.status });
    }

    const data: { choices?: { message?: { content?: string } }[] } = await r.json();
    return NextResponse.json({ content: data?.choices?.[0]?.message?.content ?? "" });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg || "proxy error" }, { status: 500 });
  }
}
