"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

function useDeckId() {
  const [deckId, setDeckId] = useState<string | null>(null);
  useEffect(() => {
    const u = new URL(window.location.href);
    setDeckId(u.searchParams.get("deckId"));
  }, []);
  return deckId;
}

const MAX_CHARS = Number(process.env.NEXT_PUBLIC_MAX_SOURCE_CHARS ?? 8000);

export default function NewCards() {
  const deckId = useDeckId();
  const [source, setSource] = useState("");
  const [count, setCount] = useState(10);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  const tooLong = source.length > MAX_CHARS;
  const nearLimit = !tooLong && source.length > Math.floor(MAX_CHARS * 0.9);

  async function generate() {
    if (!deckId) { alert("Missing deckId"); return; }
    if (!source.trim()) { setStatus("Please paste some text."); return; }
    if (tooLong) { setStatus(`Text too long: ${source.length} > ${MAX_CHARS} characters. Split it and try again.`); return; }

    setBusy(true); setStatus("Asking AI to generate cards...");
    const prompt = `From the text below, generate ${count} flashcards as compact Q/A JSON array with keys "q" and "a". Keep answers concise.\nTEXT:\n${source}`;
    try {
      const r = await fetch("/api/ai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: prompt }] })
      });
      if (!r.ok) throw new Error(`AI HTTP ${r.status}`);
      const j = await r.json();
      const content = j.content ?? "";
      let cards: Array<{ q: string; a: string }>;

      try {
        cards = JSON.parse(content);
        if (!Array.isArray(cards)) throw new Error("Not array");
      } catch {
        const m = content.match(/```json([\s\S]*?)```/i);
        if (!m) throw new Error("AI did not return JSON");
        cards = JSON.parse(m[1]);
      }

      setStatus("Saving cards...");
      const save = await fetch("/api/cards", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deckId, cards })
      });
      if (!save.ok) throw new Error(`Save failed (HTTP ${save.status})`);
      setStatus(`Saved ${cards.length} cards. You can start reviewing soon.`);
    } catch (e: any) {
      setStatus(`Error: ${e?.message ?? "unknown"}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">Generate Cards</h1>
        <p className="text-sm text-neutral-600 mt-1">
          Paste source text (max {MAX_CHARS.toLocaleString()} chars), choose how many cards, then let AI generate concise Q/A pairs.
        </p>

        <div className="mt-5 space-y-3">
          <textarea
            className={`w-full h-56 border rounded-lg p-3 focus:outline-none focus:ring-2 ${tooLong ? "border-red-400 focus:ring-red-500" : "focus:ring-neutral-800"}`}
            placeholder="Paste source text here…"
            value={source}
            onChange={(e) => setSource(e.target.value)}
          />
          <div className="flex justify-between items-center text-sm">
            <div className={`${tooLong ? "text-red-600" : nearLimit ? "text-amber-600" : "text-neutral-600"}`}>
              {source.length.toLocaleString()} / {MAX_CHARS.toLocaleString()} characters
              {tooLong ? " — too long" : nearLimit ? " — near limit" : ""}
            </div>
            <div className="flex items-center gap-3">
              <label className="text-neutral-700">Count</label>
              <input
                type="number"
                min={1}
                max={50}
                value={count}
                onChange={(e)=>setCount(parseInt(e.target.value || "10"))}
                className="border rounded-lg p-2 w-24 focus:outline-none focus:ring-2 focus:ring-neutral-800"
              />
              <button
                onClick={generate}
                disabled={busy || !source.trim() || tooLong}
                className="rounded-lg bg-neutral-900 text-white px-4 py-2 hover:bg-black disabled:opacity-50">
                {busy ? "Working…" : "Generate & Save"}
              </button>
            </div>
          </div>

          {tooLong && (
            <div className="rounded-lg border bg-red-50 p-3 text-sm text-red-800">
              Your text is {source.length.toLocaleString()} chars. The limit is {MAX_CHARS.toLocaleString()}.
              Split it into smaller chunks and try again.
            </div>
          )}
          {status && !tooLong && (
            <div className="rounded-lg border bg-neutral-50 p-3 text-sm text-neutral-800">
              {status}
            </div>
          )}
        </div>
      </div>

      <Link href="/" className="text-sm text-neutral-600 underline">← Back to Decks</Link>
    </div>
  );
}
