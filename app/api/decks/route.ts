import { NextResponse } from "next/server";
import path from "node:path";
import { loadAllDecks } from "@/lib/decks/loader";

export const runtime = "nodejs";

export async function GET() {
  const decks = await loadAllDecks(path.join(process.cwd(), "decks"));
  // Stable display order: Pimsleur L1 → L5, then HSK 1 → 2, then anything else.
  const order = ["pimsleur-l1", "pimsleur-l2", "pimsleur-l3", "pimsleur-l4", "pimsleur-l5", "hsk1", "hsk2"];
  const rank = (id: string) => {
    const i = order.indexOf(id);
    return i === -1 ? order.length : i;
  };
  const list = decks
    .map((d) => ({ id: d.deck.id, title: d.deck.title, pairCount: d.pairs.length }))
    .sort((a, b) => rank(a.id) - rank(b.id) || a.title.localeCompare(b.title));
  return NextResponse.json({ decks: list });
}
