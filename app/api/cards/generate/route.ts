export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";

type QA = { q: string; a: string };

function looksQAArray(x: unknown): x is QA[] {
  return Array.isArray(x) && x.every(
    (i) => i && typeof i === "object" && typeof (i as { q?: unknown }).q === "string" && typeof (i as { a?: unknown }).a === "string"
  );
}

function deepFindFirstArray(obj: unknown): unknown[] | null {
  const stack: unknown[] = [obj];
  while (stack.length) {
    const v = stack.pop();
    if (Array.isArray(v)) return v;
    if (v && typeof v === "object") {
      for (const k of Object.keys(v as Record<string, unknown>)) {
        stack.push((v as Record<string, unknown>)[k]);
      }
    }
  }
  return null;
}

function sanitizeJsonGuess(s: string) {
  let t = s;
  t = t.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
  t = t.replace(/```json|```/gi, "");
  t = t.replace(/,\s*]/g, "]").replace(/,\s*}/g, "}");
  return t;
}

function extractCardsServer(content: string): QA[] {
  const raw = content ?? "";

  // 1) direct parse
  try {
    const parsed = JSON.parse(raw);
    if (looksQAArray(parsed)) return parsed;
    if (parsed && typeof parsed === "object") {
      const arr = deepFindFirstArray(parsed);
      if (arr && looksQAArray(arr)) return arr as QA[];
    }
  } catch {}

  // 2) fenced
  const fenced = raw.match(/```json([\s\S]*?)```/i) || raw.match(/```([\s\S]*?)```/i);
  if (fenced) {
    const cleaned = sanitizeJsonGuess(fenced[1].trim());
    try {
      const parsed = JSON.parse(cleaned);
      if (looksQAArray(parsed)) return parsed;
      const arr = deepFindFirstArray(parsed);
      if (arr && looksQAArray(arr)) return arr as QA[];
    } catch {}
  }

  // 3) top-level array substring
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start !== -1 && end !== -1 && end > start) {
    const maybe = sanitizeJsonGuess(raw.slice(start, end + 1));
    try {
      const parsed = JSON.parse(maybe);
      if (looksQAArray(parsed)) return parsed;
      const arr = deepFindFirstArray(parsed);
      if (arr && looksQAArray(arr)) return arr as QA[];
    } catch {}
  }

  // 4) individual objects
  const objs: QA[] = [];
  const cleanedAll = sanitizeJsonGuess(raw);
  const candidates = cleanedAll.match(/{[\s\S]*?}/g) || [];
  for (const c of candidates) {
    try {
      const o = JSON.parse(c) as { q?: unknown; a?: unknown };
      if (typeof o.q === "string" && typeof o.a === "string") objs.push({ q: o.q, a: o.a });
    } catch {}
  }
  if (objs.length) return objs;

  throw new Error("AI did not return JSON");
}

export async function POST(req: NextRequest) {
  try {
    const { source, count } = (await req.json()) as { source?: string; count?: number };
    if (!source) return NextResponse.json({ error: "source required" }, { status: 400 });
    const n = Math.max(1, Math.min(50, Number(count) || 10));

    const system = `You are a flashcard generator. Output strictly a JSON array where each item is {"q": "...", "a": "..."}.
No explanations, no code fences, no extra text. Maximum ${n} items. Answers must be concise.`;
    const user = `Create up to ${n} Q/A flashcards from the text below:
TEXT:
${source}`;

    const r = await fetch(process.env.BELTO_API_URL!, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.BELTO_API_MODEL || "local",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user }
        ],
        max_tokens: 512,
        temperature: 0.2
      })
    });

    if (!r.ok) {
      const t = await r.text().catch(() => "");
      return NextResponse.json({ error: t || r.statusText }, { status: r.status });
    }

    const data = (await r.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data?.choices?.[0]?.message?.content ?? "";
    const cards = extractCardsServer(content).slice(0, n);
    return NextResponse.json({ cards, raw: content.slice(0, 1000) });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg || "server error" }, { status: 500 });
  }
}
