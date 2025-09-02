"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
type QA = { q: string; a: string };

function useDeckId() {
  const [deckId, setDeckId] = useState<string | null>(null);
  useEffect(() => {
    const u = new URL(window.location.href);
    setDeckId(u.searchParams.get("deckId"));
  }, []);
  return deckId;
}

export default function NewCards() {
  const deckId = useDeckId();
  const [source, setSource] = useState("");
  const [count, setCount] = useState(10);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [preview, setPreview] = useState<QA[]>([]);
  const [raw, setRaw] = useState("");

  async function generate() {
    if (!deckId) return alert("Missing deckId");
    if (!source.trim()) return alert("Paste some source text");

    setBusy(true); setStatus("Generating…"); setPreview([]); setRaw("");
    try {
      const r = await fetch("/api/cards/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source, count })
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "generation failed");
      setPreview(j.cards || []);
      setRaw(j.raw || "");
      setStatus(`Generated ${j.cards?.length ?? 0} cards. Review and click Save.`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus(`Error: ${msg}`);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!deckId) return;
    if (!preview.length) return alert("Nothing to save");
    setBusy(true); setStatus("Saving to database…");
    try {
      const res = await fetch("/api/cards", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deckId, cards: preview })
      });
      if (!res.ok) throw new Error("Save failed");
      setStatus(`Saved ${preview.length} cards.`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus(`Error: ${msg}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">Generate Cards</h1>
        <p className="text-sm text-neutral-600 mt-1">Paste source → Generate → Review → Save.</p>

        <div className="mt-5 space-y-4">
          <textarea
            className="w-full h-48 border rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-neutral-800"
            placeholder="Paste source text here…"
            value={source}
            onChange={(e) => setSource(e.target.value)}
          />
          <div className="flex items-center gap-3">
            <label className="text-sm text-neutral-700">Count</label>
            <input type="number" min={1} max={50} value={count}
                   onChange={(e)=>setCount(parseInt(e.target.value || "10"))}
                   className="border rounded-lg p-2 w-24 focus:outline-none focus:ring-2 focus:ring-neutral-800"/>
            <button onClick={generate} disabled={busy}
                    className="rounded-lg bg-neutral-900 text-white px-4 py-2 hover:bg-black disabled:opacity-50">
              {busy ? "Working…" : "Generate"}
            </button>
            <button onClick={save} disabled={busy || preview.length===0}
                    className="rounded-lg bg-emerald-600 text-white px-4 py-2 hover:bg-emerald-700 disabled:opacity-50">
              Save
            </button>
          </div>
          {status && <div className="rounded-lg border bg-neutral-50 p-3 text-sm text-neutral-800">{status}</div>}
          {raw && <details className="text-xs text-neutral-500"><summary>Raw model output (first 1000 chars)</summary><pre className="whitespace-pre-wrap">{raw.slice(0,1000)}</pre></details>}
        </div>
      </div>

      {preview.length > 0 && (
        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Preview ({preview.length})</h2>
          <div className="mt-3 divide-y">
            {preview.map((c, i) => (
              <div key={i} className="py-3">
                <div className="font-medium">Q{i+1}. {c.q}</div>
                <div className="text-neutral-700 mt-1">A: {c.a}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Link href="/" className="text-sm text-neutral-600 underline">← Back to Decks</Link>
    </div>
  );
}
