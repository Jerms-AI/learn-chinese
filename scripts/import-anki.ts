import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import AdmZip from "adm-zip";
import initSqlJs from "sql.js";

export type RawCard = { hanzi: string; pinyin: string; english: string };

export async function extractCardsFromApkg(apkgPath: string): Promise<RawCard[]> {
  const zip = new AdmZip(apkgPath);
  const dbEntry = zip.getEntry("collection.anki2") ?? zip.getEntry("collection.anki21");
  if (!dbEntry) throw new Error("apkg missing collection.anki2(1)");

  const SQL = await initSqlJs();
  const db = new SQL.Database(dbEntry.getData());
  const result = db.exec("SELECT flds FROM notes");
  if (result.length === 0) return [];

  const rows = result[0].values as string[][];
  return rows.map(([flds]) => {
    const parts = flds.split("\x1f");
    return {
      hanzi: parts[0]?.trim() ?? "",
      pinyin: parts[1]?.trim() ?? "",
      english: parts[2]?.trim() ?? "",
    };
  });
}

const isMain =
  typeof process !== "undefined" &&
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  const [, , inputPath, outputPath, deckId, deckTitle] = process.argv;
  if (!inputPath || !outputPath || !deckId || !deckTitle) {
    console.error(
      "Usage: tsx scripts/import-anki.ts <input.apkg> <output.yaml> <deck-id> <deck-title>"
    );
    process.exit(1);
  }
  (async () => {
    const cards = await extractCardsFromApkg(inputPath);
    const pairs = cards.map((c, i) => ({
      id: `${deckId}-${String(i + 1).padStart(3, "0")}`,
      statement: c,
      tags: [],
    }));
    const out = {
      deck: { id: deckId, title: deckTitle, source: path.basename(inputPath) },
      pairs,
    };
    await writeFile(outputPath, yaml.dump(out, { lineWidth: 120 }), "utf8");
    console.log(`Wrote ${pairs.length} cards → ${outputPath}`);
  })();
}
