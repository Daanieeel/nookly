import { describe, expect, it } from "vitest";
import { foldText, includesFolded, rankMatches, startsWithWords } from "./text-search.ts";

const COMPOSED = "Übungsblatt";
const DECOMPOSED = "Übungsblatt";

describe("foldText", () => {
  it("makes composed and decomposed spellings the same", () => {
    expect(COMPOSED).not.toBe(DECOMPOSED);
    expect(foldText(COMPOSED)).toBe(foldText(DECOMPOSED));
  });

  it("drops accents and case", () => {
    expect(foldText("Übungsblatt")).toBe("ubungsblatt");
    expect(foldText("Café ÀÉ")).toBe("cafe ae");
  });

  it("leaves other text alone", () => {
    expect(foldText("Logik 1 - Teil")).toBe("logik 1 - teil");
  });
});

describe("includesFolded", () => {
  it("finds a decomposed title with a composed query, and the other way round", () => {
    expect(includesFolded(`Analysis: ${DECOMPOSED} 1`, "Übung")).toBe(true);
    expect(includesFolded(`Analysis: ${COMPOSED} 1`, "Übung")).toBe(true);
  });

  it("finds an accented word without typing the accent", () => {
    expect(includesFolded("Übungsblatt", "ubung")).toBe(true);
  });

  it("still misses what is not there", () => {
    expect(includesFolded("Übungsblatt", "logik")).toBe(false);
  });
});

/// Letters people really type, with the plain spelling they fall back to on a keyboard
/// without them. Each is checked composed (what a keyboard types) and decomposed (what
/// macOS saves in file names).
const LANGUAGES: [language: string, word: string, plain: string][] = [
  ["German umlauts", "Übungsblätter für Größe", "ubungsblatter fur grosse"],
  ["German sharp s", "Straße", "strasse"],
  ["German capital sharp s", "STRAẞE", "strasse"],
  [
    "French",
    "Élève à l'école, garçon, où, noël, forêt",
    "eleve a l'ecole, garcon, ou, noel, foret",
  ],
  ["French ligatures", "cœur, œuvre, Æsop", "coeur, oeuvre, aesop"],
  ["Spanish", "Año, pingüino, ¿Cómo?", "ano, pinguino, ¿como?"],
  ["Portuguese", "Ação, coração, pão, ânimo", "acao, coracao, pao, animo"],
  ["Italian", "Perché, città, più", "perche, citta, piu"],
  ["Nordic", "Ærlig, Øl, Åre, blåbær, Ångström", "aerlig, ol, are, blabaer, angstrom"],
  ["Icelandic", "Þór, Ðorri, þetta", "thor, dorri, thetta"],
  ["Polish", "Łódź, żółć, zażółć gęślą jaźń", "lodz, zolc, zazolc gesla jazn"],
  ["Czech and Slovak", "Příliš žluťoučký kůň, ďábel, ľad", "prilis zlutoucky kun, dabel, lad"],
  ["Hungarian", "Árvíztűrő tükörfúrógép", "arvizturo tukorfurogep"],
  ["Romanian", "Ștefan, țară, în, ă", "stefan, tara, in, a"],
  ["Turkish", "İstanbul, ışık, Çiğ, Şeker, öğle", "istanbul, isik, cig, seker, ogle"],
  ["Croatian", "Đurđevac, čćžšđ", "durdevac, cczsd"],
  ["Vietnamese", "Tiếng Việt, Hà Nội, Đà Nẵng", "tieng viet, ha noi, da nang"],
  ["Greek accents", "Ελληνικά, ά έ ή ί ό ύ ώ", "ελληνικα, α ε η ι ο υ ω"],
  ["Cyrillic", "Привет, Ёлка, Йод", "привет, елка, иод"],
];

describe.each(LANGUAGES)("%s", (_language, word, plain) => {
  it("folds to its plain spelling", () => {
    expect(foldText(word)).toBe(plain);
  });

  it("folds the decomposed spelling the same way", () => {
    expect(foldText(word.normalize("NFD"))).toBe(plain);
  });

  it("is found by the plain spelling, the typed one and the decomposed one", () => {
    const title = `Notes: ${word.normalize("NFD")} (2026).pdf`;
    expect(includesFolded(title, word)).toBe(true);
    expect(includesFolded(title, word.normalize("NFD"))).toBe(true);
    expect(includesFolded(title, plain)).toBe(true);
    expect(includesFolded(title.normalize("NFC"), plain.toUpperCase())).toBe(true);
  });
});

describe("what folding must not do", () => {
  it("keeps letters that are different letters apart", () => {
    expect(includesFolded("Mann", "Männ")).toBe(true);
    expect(includesFolded("Strasse", "Straße")).toBe(true);
    expect(includesFolded("Logik", "Logic")).toBe(false);
    expect(includesFolded("Ubung", "Obung")).toBe(false);
  });

  it("leaves scripts without case or accents readable", () => {
    expect(foldText("日本語のノート")).toBe("日本語のノート");
    expect(foldText("한국어 노트")).toBe(foldText("한국어 노트".normalize("NFD")));
    expect(includesFolded("한국어 노트", "노트")).toBe(true);
  });

  it("is safe on empty text and on emoji", () => {
    expect(foldText("")).toBe("");
    expect(foldText("Plan 📚 für Mai")).toBe("plan 📚 fur mai");
  });
});

describe("rankMatches", () => {
  it("lists labels that start with the term before labels that only contain it", () => {
    const labels = ["Heading 1", "Callout", "Inline math", "Linked item"];
    expect(rankMatches(labels, "in", (label) => [label])).toEqual([
      "Inline math",
      "Heading 1",
      "Linked item",
    ]);
  });

  it("ignores case and accents and keeps the given order inside each tier", () => {
    const labels = ["Café au lait", "Decaf", "Cafe noir", "Latte"];
    expect(rankMatches(labels, "CAFÉ", (label) => [label])).toEqual(["Café au lait", "Cafe noir"]);
    expect(rankMatches(labels, "af", (label) => [label])).toEqual([
      "Café au lait",
      "Decaf",
      "Cafe noir",
    ]);
  });

  it("matches any of an item's terms and puts a prefix of any of them first", () => {
    const items = [
      { title: "Heading", aliases: ["title"] },
      { title: "Toggle", aliases: ["fold"] },
      { title: "Table of contents", aliases: ["toc"] },
    ];
    expect(rankMatches(items, "t", (i) => [i.title, ...i.aliases]).map((i) => i.title)).toEqual([
      "Heading",
      "Toggle",
      "Table of contents",
    ]);
  });

  it("finds an item whose letters appear in order, after the ones that contain the term", () => {
    const labels = ["Hexa Decimal", "Hello World", "Hel o' World", "Other"];
    expect(rankMatches(labels, "Hel", (label) => [label])).toEqual([
      "Hello World",
      "Hel o' World",
      "Hexa Decimal",
    ]);
  });

  it("puts a match at the start before one in the middle or at the end, before a fuzzy one", () => {
    const labels = ["World Greg Hello", "Hexa Decimal", "World Hello Greg", "Hello World Greg"];
    expect(rankMatches(labels, "Hel", (label) => [label])).toEqual([
      "Hello World Greg",
      "World Greg Hello",
      "World Hello Greg",
      "Hexa Decimal",
    ]);
  });

  it("ignores spaces in the term and in the label", () => {
    const labels = ["Heading 1", "Heading 2", "Toggle heading"];
    for (const term of ["heading2", "heading 2", "Heading 2", "h2"]) {
      expect(rankMatches(labels, term, (label) => [label])[0]).toBe("Heading 2");
    }
    expect(rankMatches(["Math block"], "mathb", (label) => [label])).toEqual(["Math block"]);
  });

  it("drops what does not contain the letters in order", () => {
    expect(rankMatches(["Heading 1", "Callout"], "zq", (label) => [label])).toEqual([]);
    expect(rankMatches(["Callout"], "tc", (label) => [label])).toEqual([]);
  });

  it("returns everything for a term of only spaces", () => {
    expect(rankMatches(["a", "b"], "  ", (label) => [label])).toEqual(["a", "b"]);
  });
});

describe("startsWithWords", () => {
  it("needs every typed word to start some word of the text", () => {
    expect(startsWithWords("Go to Trash", "go tr")).toBe(true);
    expect(startsWithWords("Go to Trash", "go x")).toBe(false);
  });

  it("ignores accents however they are spelled", () => {
    expect(startsWithWords(`Open ${DECOMPOSED} 1`, "\u00fcbung")).toBe(true);
    expect(startsWithWords(`Open ${COMPOSED} 1`, "ubung")).toBe(true);
  });
});
