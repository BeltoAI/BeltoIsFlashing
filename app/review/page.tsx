"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

type Grade = "again" | "hard" | "good" | "easy";

type CardDoc = {
  _id: string;
  deckId: string;
  q: string;
  a: string;
  ease: number;
  interval: number;
  due: string;
};

export default function ReviewPage() {
  const [card, setCard] = useState<CardDoc | null>(null);
  const [view, setView] = useState<"front" | "back">("front");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dueCount, setDueCount] = useState<number>(0);

  // Prevent stale response overwrites
  const reqCounter = useRef(0);

  const getDeckId = () => {
    if (typeof window === "undefined") return null;
    return new URL(window.location.href).searchParams.get("deckId");
  };

  const fetchDueCount = useCallback(async (deckId: string, requestId: number) => {
    try {
      const r = await fetch(`/api/cards/count?deckId=${deckId}`, { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (requestId !== reqCounter.current) return;
      if (r.ok && typeof j?.dueNow === "number") setDueCount(j.dueNow);
    } catch {
      // non-fatal
    }
  }, []);

  // IMPORTANT: no `card` in deps (avoids infinite loop)
  const fetchNextCard = useCallback(
    async (opts?: { skip?: string[] }) => {
      const deckId = getDeckId();
      if (!deckId) {
        setError("Missing deckId");
        setLoading(false);
        return;
      }

      const requestId = ++reqCounter.current;
      if (!card) setLoading(true);
      setBusy(true);
      setError(null);

      // keep count fresh but don't block UI
      fetchDueCount(deckId, requestId);

      try {
        const p = new URLSearchParams({ deckId });
        if (opts?.skip?.length) p.set("skip", opts.skip.join(","));
        const r = await fetch(`/api/cards/review?${p.toString()}`, { cache: "no-store" });
        const j = await r.json();
        if (requestId !== reqCounter.current) return;

        if (!r.ok) throw new Error(j?.error || "Failed to load");
        setCard(j.card || null);
        setView("front");
      } catch (e: any) {
        setError(e?.message || "Load failed");
      } finally {
        if (requestId === reqCounter.current) {
          setLoading(false);
          setBusy(false);
        }
      }
    },
    [fetchDueCount] // <-- only this; NOT `card`
  );

  // Run once on mount
  useEffect(() => {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    fetchNextCard();
  }, []);

  async function grade(g: Grade) {
    if (!card?._id || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/cards/review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cardId: card._id, grade: g }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Grade failed");

      // optimistic decrement then load next
      setDueCount((x) => Math.max(0, (x ?? 1) - 1));
      await fetchNextCard();
    } catch (e: any) {
      setError(e?.message || "Grade failed");
    } finally {
      setBusy(false);
    }
  }

  async function skip() {
    if (!card?._id || busy) return;
    setBusy(true);
    setError(null);
    try {
      await fetchNextCard({ skip: [card._id] });
    } finally {
      setBusy(false);
    }
  }

  if (loading && !card) {
    return (
      <main className="max-w-2xl mx-auto p-6 space-y-4">
        <div className="h-6 w-40 bg-neutral-200 rounded animate-pulse" />
        <div className="h-4 w-24 bg-neutral-200 rounded animate-pulse" />
        <div className="h-32 w-full bg-neutral-200 rounded animate-pulse" />
      </main>
    );
  }

  return (
    <main className="max-w-2xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Review</h1>
        <div className="text-sm text-neutral-600">
          Due now: <span className="font-medium">{dueCount}</span>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 text-red-800 p-3 text-sm">
          {error}
        </div>
      )}

      {!card ? (
        <div className="rounded-xl border p-6 text-center text-neutral-600">
          🎉 No cards due.{" "}
          <Link href="/new" className="underline">
            Generate more
          </Link>
          .
        </div>
      ) : (
        <div key={card._id} className="space-y-3">
          <div className="rounded-xl border p-5 min-h-32">
            {view === "front" ? (
              <>
                <div className="text-sm text-neutral-500 mb-1">Question</div>
                <div className="text-lg">{card.q}</div>
              </>
            ) : (
              <>
                <div className="text-sm text-neutral-500 mb-1">Answer</div>
                <div className="text-lg">{card.a}</div>
              </>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {view === "front" ? (
              <>
                <button
                  disabled={busy}
                  onClick={() => setView("back")}
                  className="px-3 py-2 rounded-lg border hover:bg-neutral-50 disabled:opacity-50"
                >
                  Show answer
                </button>
                <button
                  disabled={busy}
                  onClick={skip}
                  className="px-3 py-2 rounded-lg border hover:bg-neutral-50 disabled:opacity-50"
                  title="Skip this card and pull a different one"
                >
                  Skip
                </button>
              </>
            ) : (
              <>
                <button
                  disabled={busy}
                  onClick={() => grade("again")}
                  className="px-3 py-2 rounded-lg border hover:bg-neutral-50 disabled:opacity-50"
                >
                  Again
                </button>
                <button
                  disabled={busy}
                  onClick={() => grade("hard")}
                  className="px-3 py-2 rounded-lg border hover:bg-neutral-50 disabled:opacity-50"
                >
                  Hard
                </button>
                <button
                  disabled={busy}
                  onClick={() => grade("good")}
                  className="px-3 py-2 rounded-lg border hover:bg-neutral-50 disabled:opacity-50"
                >
                  Good
                </button>
                <button
                  disabled={busy}
                  onClick={() => grade("easy")}
                  className="px-3 py-2 rounded-lg border hover:bg-neutral-50 disabled:opacity-50"
                >
                  Easy
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
