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

  // history for Next/Previous
  const [seen, setSeen] = useState<CardDoc[]>([]);
  const [idx, setIdx] = useState<number>(-1);

  // prevent stale overwrites
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
    } catch {}
  }, []);

  // fetch a brand-new next card (skip seen)
  const fetchNextFresh = useCallback(async () => {
    const deckId = getDeckId();
    if (!deckId) {
      setError("Missing deckId");
      setLoading(false);
      return null;
    }
    const requestId = ++reqCounter.current;
    setLoading(true);
    setBusy(true);
    setError(null);

    fetchDueCount(deckId, requestId);
    try {
      const params = new URLSearchParams({ deckId });
      const skips = seen.map((c) => c._id);
      if (skips.length) params.set("skip", skips.join(","));
      const r = await fetch(`/api/cards/review?${params.toString()}`, { cache: "no-store" });
      const j = await r.json();
      if (requestId !== reqCounter.current) return null;
      if (!r.ok) throw new Error(j?.error || "Failed to load");
      const nextCard: CardDoc | null = j.card || null;
      return nextCard;
    } catch (e: any) {
      setError(e?.message || "Load failed");
      return null;
    } finally {
      if (requestId === reqCounter.current) {
        setLoading(false);
        setBusy(false);
      }
    }
  }, [fetchDueCount, seen]);

  // initial load
  useEffect(() => {
    (async () => {
      const first = await fetchNextFresh();
      if (first) {
        setSeen([first]);
        setIdx(0);
        setCard(first);
        setView("front");
      } else {
        setSeen([]);
        setIdx(-1);
        setCard(null);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // navigation
  const previous = async () => {
    if (busy) return;
    if (idx > 0) {
      setIdx(idx - 1);
      setCard(seen[idx - 1]);
      setView("front");
    }
  };

  const next = async () => {
    if (busy) return;
    // If we already have a later item in history, just move forward
    if (idx + 1 < seen.length) {
      setIdx(idx + 1);
      setCard(seen[idx + 1]);
      setView("front");
      return;
    }
    // Otherwise fetch a fresh one
    const fresh = await fetchNextFresh();
    if (fresh) {
      setSeen((arr) => [...arr, fresh]);
      setIdx((i) => i + 1);
      setCard(fresh);
      setView("front");
    } else {
      // none due; show empty state
      setCard(null);
      setIdx(seen.length - 1);
    }
  };

  // grading
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

      // optimistic count decrement, then move forward
      setDueCount((x) => Math.max(0, (x ?? 1) - 1));
      await next();
    } catch (e: any) {
      setError(e?.message || "Grade failed");
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
          🎉 No cards due. <Link href="/new" className="underline">Generate more</Link>.
        </div>
      ) : (
        <div className="space-y-3">
          {/* nav row */}
          <div className="flex items-center justify-between">
            <button
              onClick={previous}
              disabled={busy || idx <= 0}
              className="px-3 py-2 rounded-lg border hover:bg-neutral-50 disabled:opacity-50"
            >
              ← Previous
            </button>
            <div className="text-xs text-neutral-500">
              {idx >= 0 ? `Card ${idx + 1}${seen.length ? ` of ${seen.length}` : ""}` : null}
            </div>
            <button
              onClick={next}
              disabled={busy}
              className="px-3 py-2 rounded-lg border hover:bg-neutral-50 disabled:opacity-50"
            >
              Next →
            </button>
          </div>

          <div key={card._id} className="rounded-xl border p-5 min-h-32">
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
              <button
                disabled={busy}
                onClick={() => setView("back")}
                className="px-3 py-2 rounded-lg border hover:bg-neutral-50 disabled:opacity-50"
              >
                Show answer
              </button>
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
