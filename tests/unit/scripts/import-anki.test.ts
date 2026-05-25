// @vitest-environment node
import { describe, it, expect, beforeAll } from "vitest";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import AdmZip from "adm-zip";
import initSqlJs from "sql.js";
import { extractCardsFromApkg } from "@/scripts/import-anki";

const fixtureDir = path.join(process.cwd(), "tests", "fixtures");
const fixturePath = path.join(fixtureDir, "mini.apkg");

beforeAll(async () => {
  await mkdir(fixtureDir, { recursive: true });
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run(`CREATE TABLE notes (id INTEGER PRIMARY KEY, flds TEXT)`);
  db.run(`INSERT INTO notes VALUES (1, ?)`, ["你好\x1fnǐ hǎo\x1fhello"]);
  db.run(`INSERT INTO notes VALUES (2, ?)`, ["再见\x1fzàijiàn\x1fgoodbye"]);
  const data = db.export();
  const zip = new AdmZip();
  zip.addFile("collection.anki2", Buffer.from(data));
  zip.writeZip(fixturePath);
});

describe("extractCardsFromApkg", () => {
  it("returns rows of (hanzi, pinyin, english)", async () => {
    const cards = await extractCardsFromApkg(fixturePath);
    expect(cards).toHaveLength(2);
    expect(cards[0]).toEqual({ hanzi: "你好", pinyin: "nǐ hǎo", english: "hello" });
  });
});
