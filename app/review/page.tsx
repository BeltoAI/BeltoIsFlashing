"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Grade = "again" | "hard" | "good" | "easy";

type CardT = {
  _id: string;
  q: string;
  a: string;
  ease: number;
  interval: number;
  due: string;
  deckId: string;
} | null;

export default function ReviewPage() {
  const [card, setCard] = useState<CardT>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dueCount, setDueCount] = useState<number>(0);
  const [recentIds, setRecentIds] = useState<string[]>([]);

  const deckId = useMemo(() => {
    if (typeof window === "undefined") return "";
    const u = new URL(window.location.href);
    return u.searchParams.get("deckId") || "";
  }, []);

  function pushRecent(id?: string | null) {
    if (!id) return;
    setRecentIds((prev) => {
      const next = [...prev, id];
      const dedup: string[] = [];
      for (const x of next) if (!dedup.includes(x)) dedup.push(x);
      return dedup.slice(-5); // keep last 5 unique
    });
  }

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      if (!deckId) {
        setError("Missing deckId");
        setLoading(false);
        return;
      }

      // refresh due count
      try {
        const c = await fetch(`/api/cards/count?deckId=${deckId}`, { cache: "no-store" });
        const cj = await c.json();
        if (c.ok && typeof cj?.dueNow === "number") setDueCount(cj.dueNow);
      } catch {}

      const skipParam = recentIds.length ? `&skip=${encodeURIComponent(recentIds.join(","))}` : "";
      const r = await fetch(`/api/cards/review?deckId=${deckId}${skipParam}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Failed to load");
      setCard(j.card || null);
      setShowAnswer(false);
      pushRecent(j?.card?._id);
    } catch (e: any) {
      setError(e?.message || "Load failed");
    } finally {
      setLoading(false);
    }
  };

  async function grade(g: Grade) {
    try {
      if (!card?._id) return;
      // Ensure we won't immediately see this again
      pushRecent(card._id);
      const r = await fetch("/api/cards/review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cardId: card._id, grade: g }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Grade failed");
      setDueCount((x) => Math.max(0, (x || 1) - 1));
      await load();
    } catch (e: any) {
      setError(e?.message || "Grade failed");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount

  return (
    <main className="max-w-2xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Review</h1>
        <Link href="/" className="text-sm underline">Home</Link>
      </div>
      <div className="text-sm text-neutral-600">Due now: <span className="font-medium">{dueCount}</span></div>

      {loading && <div className="text-neutral-500">Loading…</div>}
      {error && <div className="text-red-600">Error: {error}</div>}
      {!loading && !error && !card && (
        <div className="text-neutral-600">No cards due. Nice!</div>
      )}
      {!loading && !error && card && (
        <div className="rounded-2xl border bg-white p-4 shadow-sm space-y-4">
          <div>
            <div className="text-sm text-neutral-500 mb-1">Question</div>
            <div className="text-lg">{card.q}</div>
          </div>

          <div>
            <button
              className="rounded-xl border px-3 py-1 text-sm"
              onClick={() => setShowAnswer((s) => !s)}
            >
              {showAnswer ? "Hide answer" : "Show answer"}
            </button>
            {showAnswer && (
              <div className="mt-3">
                <div className="text-sm text-neutral-500 mb-1">Answer</div>
                <div className="text-lg whitespace-pre-wrap">{card.a}</div>
              </div>
            )}
          </div>

          <div className="flex gap-2 flex-wrap">
            <button className="rounded-xl border px-3 py-1" onClick={() => grade("again")}>Again</button>
            <button className="rounded-xl border px-3 py-1" onClick={() => grade("hard")}>Hard</button>
            <button className="rounded-xl border px-3 py-1" onClick={() => grade("good")}>Good</button>
            <button className="rounded-xl border px-3 py-1" onClick={() => grade("easy")}>Easy</button>
            <button
              className="rounded-xl border px-3 py-1 ml-auto"
              onClick={() => {
                // Skip without grading: just fetch new with current in recentIds
                pushRecent(card._id);
                load();
              }}
            >
              Skip
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
