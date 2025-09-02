'use client';

import { useEffect, useState, useCallback } from 'react';

type Grade = 'again' | 'hard' | 'good' | 'easy';

type Card = {
  _id: string;
  q: string;
  a: string;
  ease: number;
  interval: number;
  due: string;
};

export default function ReviewPage() {
  const [card, setCard] = useState<Card | null>(null);
  const [showA, setShowA] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dueCount, setDueCount] = useState<number>(0);
  const [lastId, setLastId] = useState<string | null>(null);

  const getDeckId = () => {
    const u = new URL(window.location.href);
    return u.searchParams.get('deckId');
  };

  const fetchDueCount = useCallback(async (deckId: string) => {
    try {
      const r = await fetch(`/api/cards/count?deckId=${deckId}`, { cache: 'no-store' });
      const j = await r.json();
      if (r.ok && typeof j?.dueNow === 'number') setDueCount(j.dueNow);
    } catch {
      /* ignore */
    }
  }, []);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const deckId = getDeckId();
      if (!deckId) {
        setError('Missing deckId');
        setLoading(false);
        return;
      }

      // Always fetch due-count, then pull a card; include lastId to avoid immediate repeat
      await fetchDueCount(deckId);

      const params = new URLSearchParams({ deckId });
      if (lastId) params.append('skip', lastId);

      const r = await fetch(`/api/cards/review?${params.toString()}`, { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || 'Failed to load card');
      const next: Card | null = j.card || null;

      setCard(next);
      setShowA(false);
      // If we got a new card, record its id as lastId to prevent a loop on the next load
      setLastId(next?._id ?? null);
    } catch (e: any) {
      setError(e?.message || 'Load failed');
    } finally {
      setLoading(false);
    }
  }, [fetchDueCount, lastId]);

  useEffect(() => {
    load();
  }, [load]);

  async function grade(g: Grade) {
    try {
      if (!card?._id) return;
      setLoading(true);
      setError(null);

      const r = await fetch('/api/cards/review', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cardId: card._id, grade: g }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || 'Grade failed');

      // Optimistic decrement; then load the next card (load will pass lastId to avoid a repeat)
      setDueCount((x) => Math.max(0, (x || 1) - 1));
      await load();
    } catch (e: any) {
      setError(e?.message || 'Grade failed');
    } finally {
      setLoading(false);
    }
  }

  async function skip() {
    try {
      if (!card?._id) return;
      const deckId = getDeckId();
      if (!deckId) {
        setError('Missing deckId');
        return;
      }
      setLoading(true);
      setError(null);

      // Ask the server for the next card, explicitly skipping the current id
      const r = await fetch(
        `/api/cards/review?deckId=${deckId}&skip=${card._id}`,
        { cache: 'no-store' }
      );
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || 'Skip failed');

      const next: Card | null = j.card || null;
      setCard(next);
      setShowA(false);
      setLastId(next?._id ?? card._id); // remember what we just saw to avoid loop on next auto-load
    } catch (e: any) {
      setError(e?.message || 'Skip failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="max-w-2xl mx-auto p-6 space-y-4">
      <h1 className="text-xl font-semibold">Review</h1>
      <div className="text-sm text-neutral-600">
        Due now:{' '}
        <span className="font-medium">{typeof dueCount === 'number' ? dueCount : 0}</span>
      </div>

      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading && <div className="text-sm">Loading…</div>}

      {!loading && !card && (
        <div className="rounded-lg border p-4 text-sm">
          🎉 No cards due. Come back later!
        </div>
      )}

      {card && (
        <div className="rounded-xl border p-5 space-y-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-neutral-500 mb-1">Question</div>
            <div className="text-base whitespace-pre-wrap">{card.q}</div>
          </div>

          {!showA ? (
            <button
              className="rounded-lg border px-3 py-1.5 text-sm hover:bg-neutral-50 disabled:opacity-50"
              onClick={() => setShowA(true)}
              disabled={loading}
            >
              Show answer
            </button>
          ) : (
            <>
              <div>
                <div className="text-xs uppercase tracking-wide text-neutral-500 mb-1">Answer</div>
                <div className="text-base whitespace-pre-wrap">{card.a}</div>
              </div>

              <div className="flex gap-2 flex-wrap">
                <button
                  className="rounded-lg border px-3 py-1.5 text-sm hover:bg-neutral-50 disabled:opacity-50"
                  onClick={() => grade('again')}
                  disabled={loading}
                >
                  Again
                </button>
                <button
                  className="rounded-lg border px-3 py-1.5 text-sm hover:bg-neutral-50 disabled:opacity-50"
                  onClick={() => grade('hard')}
                  disabled={loading}
                >
                  Hard
                </button>
                <button
                  className="rounded-lg border px-3 py-1.5 text-sm hover:bg-neutral-50 disabled:opacity-50"
                  onClick={() => grade('good')}
                  disabled={loading}
                >
                  Good
                </button>
                <button
                  className="rounded-lg border px-3 py-1.5 text-sm hover:bg-neutral-50 disabled:opacity-50"
                  onClick={() => grade('easy')}
                  disabled={loading}
                >
                  Easy
                </button>

                <div className="flex-1" />

                <button
                  className="rounded-lg border px-3 py-1.5 text-sm hover:bg-neutral-50 disabled:opacity-50"
                  onClick={skip}
                  disabled={loading}
                  title="Show a different due card"
                >
                  Skip
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </main>
  );
}
