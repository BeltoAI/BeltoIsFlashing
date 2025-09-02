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

type CardT = { _id: string; q: string; a: string; ease: number; interval: number; due: string };

export default function ReviewPage() {
  const deckId = useDeckId();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [card, setCard] = useState<CardT | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [noneDue, setNoneDue] = useState(false);

  async function load() {
    if (!deckId) return;
    setLoading(true); setError(""); setShowAnswer(false);
    try {
      const r = await fetch(`/api/cards/review?deckId=${encodeURIComponent(deckId)}`, { cache: "no-store" });
      if (r.status === 204) { setNoneDue(true); setCard(null); return; }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      setCard(j.card);
      setNoneDue(!j.card);
    } catch (e:any) {
      setError(e?.message || "Failed to load card");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [deckId]);

  async function grade(g: "again" | "hard" | "good" | "easy") {
    if (!card) return;
    try {
      const r = await fetch("/api/cards/review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cardId: card._id, grade: g }),
      });
      if (!r.ok) throw new Error(`Grade failed (HTTP ${r.status})`);
      await load();
    } catch (e:any) {
      setError(e?.message || "Grade failed");
    }
  }

  if (!deckId) {
    return (
      <main className="max-w-2xl mx-auto p-6">
        <div className="rounded-2xl border bg-white p-6">
          <h1 className="text-xl font-semibold">Review</h1>
          <p className="mt-2 text-neutral-700">
            No <code>deckId</code> provided. Choose a deck first.
          </p>
          <Link href="/" className="underline text-sm mt-3 inline-block">← Back to decks</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-2xl mx-auto p-6 space-y-4">
      <div className="rounded-2xl border bg-white p-6">
        <h1 className="text-xl font-semibold">Review</h1>

        {loading && <p className="text-neutral-600 mt-2">Loading…</p>}

        {error && (
          <div className="mt-3 rounded-lg border bg-red-50 p-3 text-sm text-red-800">
            {error}
          </div>
        )}

        {!loading && noneDue && !error && (
          <div className="mt-3 rounded-lg border bg-neutral-50 p-3 text-sm">
            No cards are due right now. Add cards or come back later.
            <div className="mt-2">
              <Link href={`/new?deckId=${deckId}`} className="underline">Add cards</Link>
            </div>
          </div>
        )}

        {!loading && card && !error && (
          <div className="mt-5 space-y-4">
            <div className="rounded-lg border p-4">
              <div className="font-medium">Q:</div>
              <div className="mt-1">{card.q}</div>
            </div>

            {showAnswer ? (
              <div className="rounded-lg border p-4 bg-neutral-50">
                <div className="font-medium">A:</div>
                <div className="mt-1">{card.a}</div>
              </div>
            ) : (
              <button
                onClick={() => setShowAnswer(true)}
                className="rounded-lg bg-neutral-900 text-white px-4 py-2 hover:bg-black">
                Show answer
              </button>
            )}

            {showAnswer && (
              <div className="flex gap-2">
                <button onClick={()=>grade("again")} className="rounded-lg border px-3 py-2">Again</button>
                <button onClick={()=>grade("hard")}  className="rounded-lg border px-3 py-2">Hard</button>
                <button onClick={()=>grade("good")}  className="rounded-lg border px-3 py-2 bg-neutral-900 text-white">Good</button>
                <button onClick={()=>grade("easy")}  className="rounded-lg border px-3 py-2">Easy</button>
              </div>
            )}
          </div>
        )}
      </div>

      <Link href="/" className="text-sm text-neutral-600 underline">← Back to decks</Link>
    </main>
  );
}
