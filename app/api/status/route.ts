export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { dbConnect } from "@/src/lib/db";

export async function GET() {
  const out:any = {
    env: {
      BELTO_API_URL: !!process.env.BELTO_API_URL,
      BELTO_API_MODEL: !!process.env.BELTO_API_MODEL,
      MONGODB_URI: !!process.env.MONGODB_URI,
    },
    checks: { mongo:false, llm:false },
    errors: {} as Record<string,string>,
  };
  try { await dbConnect(); out.checks.mongo = true; }
  catch (e:any) { out.errors.mongo = e?.message || String(e); }

  try {
    const r = await fetch(process.env.BELTO_API_URL!, {
      method:"POST",
      headers:{ "content-type":"application/json" },
      body: JSON.stringify({
        model: process.env.BELTO_API_MODEL || "local",
        messages:[{ role:"user", content:'Return JSON: [{"q":"Q1","a":"A1"}]' }],
        max_tokens: 32, temperature: 0.1
      })
    });
    const j = await r.json().catch(()=>({}));
    out.checks.llm = r.ok && !!j?.choices?.[0]?.message?.content;
    if (!out.checks.llm) out.errors.llm = j?.error || r.statusText || "llm unreachable";
  } catch (e:any) {
    out.errors.llm = e?.message || String(e);
  }
  return NextResponse.json(out);
}
