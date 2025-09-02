"use client";
import { useEffect, useState } from "react";

type Card = { _id:string; question:string; answer:string; box:number; nextReview:string };

function useDeckId() {
  const [deckId, setDeckId] = useState<string | null>(null);
  useEffect(() => {
    const u = new URL(window.location.href);
    setDeckId(u.searchParams.get("deckId"));
  }, []);
  return deckId;
}

export default function Review() {
  const deckId = useDeckId();
  const [card, setCard] = useState<Card | null>(null);
  const [showA, setShowA] = useState(false);
  const [status, setStatus] = useState("");

  async function load() {
    if (!deckId) return;
    setStatus("Loading next card…");
    const r = await fetch(`/api/cards/review?deckId=${deckId}`);
    const j = await r.json();
    setCard(j);
    setShowA(false);
    setStatus(j ? "" : "No cards due. 🎉");
  }

  useEffect(() => { load(); }, [deckId]);

  async function rate(ease: "again"|"good"|"easy") {
    if (!card) return;
    setStatus("Scheduling…");
    const r = await fetch("/api/cards/review", {
      method: "POST",
      headers: { "content-type":"application/json" },
      body: JSON.stringify({ cardId: card._id, ease })
    });
    if (!r.ok) { setStatus("Failed to schedule"); return; }
    await load();
  }

  return (
    <div className="rounded-2xl border bg-white p-6 shadow-sm space-y-4">
      <h1 className="text-2xl font-semibold">Review</h1>
      {status && <div className="text-sm text-neutral-600">{status}</div>}
      {!card ? (
        <a href="/" className="text-sm underline text-neutral-600">← Back to Decks</a>
      ) : (
        <div className="space-y-4">
          <div className="text-lg font-medium">Q: {card.question}</div>
          {showA ? (
            <>
              <div className="text-neutral-800">A: {card.answer}</div>
              <div className="flex gap-2">
                <button onClick={()=>rate("again")} className="px-3 py-2 rounded bg-red-600 text-white">Again</button>
                <button onClick={()=>rate("good")}  className="px-3 py-2 rounded bg-neutral-900 text-white">Good</button>
                <button onClick={()=>rate("easy")}  className="px-3 py-2 rounded bg-emerald-600 text-white">Easy</button>
              </div>
            </>
          ) : (
            <button onClick={()=>setShowA(true)} className="px-4 py-2 rounded bg-neutral-900 text-white">Show Answer</button>
          )}
          <div><a href="/" className="text-sm underline text-neutral-600">← Back to Decks</a></div>
        </div>
      )}
    </div>
  );
}
