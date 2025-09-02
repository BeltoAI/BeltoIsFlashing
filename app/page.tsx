"use client";
import { useEffect, useState } from "react";

type Deck = { _id: string; name: string };

export default function Home() {
  const [name, setName] = useState("");
  const [decks, setDecks] = useState<Deck[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const r = await fetch("/api/decks");
    const j = await r.json();
    setDecks(j);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function createDeck(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const r = await fetch("/api/decks", { method: "POST", body: JSON.stringify({ name }) });
    if (r.ok) { setName(""); await load(); }
  }

  return (
    <div className="space-y-8">
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">Decks</h1>
        <p className="text-sm text-neutral-600 mt-1">Create a deck, then add cards via AI.</p>

        <form onSubmit={createDeck} className="mt-5 flex gap-3">
          <input
            className="border rounded-lg p-2 flex-1 focus:outline-none focus:ring-2 focus:ring-neutral-800"
            placeholder="New deck name"
            value={name}
            onChange={e => setName(e.target.value)}
          />
          <button className="rounded-lg bg-neutral-900 text-white px-4 py-2 hover:bg-black">
            Create
          </button>
        </form>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {loading ? (
          <div className="text-neutral-500">Loading…</div>
        ) : decks.length === 0 ? (
          <div className="text-neutral-500">No decks yet. Create one above.</div>
        ) : decks.map(d => (
          <div key={d._id} className="rounded-2xl border bg-white p-4 shadow-sm">
            <div className="font-medium">{d.name}</div>
            <div className="text-sm text-neutral-600 mt-1 flex gap-3">
              <a href={`/new?deckId=${d._id}`} className="underline">Add cards</a>
              <a href={`/review?deckId=${d._id}`} className="underline">Review</a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
