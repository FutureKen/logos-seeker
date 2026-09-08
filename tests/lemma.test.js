import { describe, it, expect } from "vitest";
import {
  applyAnswer,
  buildPrompt,
  candidateSpan,
  countFollowers,
  parseAnswer,
  stickyExtension,
  verifyLemma,
  verseCandidates,
} from "../scripts/lib/lemma.mjs";
import { repairTable } from "../scripts/lemma-cn.mjs";

/**
 * The rules that recover a Chinese marker's anchor word. The site gives only
 * the marker's position, so a candidate is cut by position alone and a model
 * decides where inside it the word ends — but nothing a model says reaches the
 * data without passing `verifyLemma`, which is what most of this file pins.
 */

const GEN_1_1 = "起初神创造诸天与地，";
const GEN_1_26 =
  "神说，我们要按着我们的形像，照着我们的样式造人，使他们管理海里的鱼、空中的鸟、地上的牲畜、和全地、并地上所爬的一切爬物。";

describe("candidateSpan", () => {
  it("stops at the next marker", () => {
    expect(candidateSpan(GEN_1_1, 0, 2)).toBe("起初");
    expect(candidateSpan(GEN_1_1, 2, 3)).toBe("神");
  });

  it("stops at punctuation", () => {
    // The last marker of the verse runs to the comma, not past it.
    expect(candidateSpan(GEN_1_1, 5, null)).toBe("诸天与地");
  });

  it("never carries the punctuation itself", () => {
    // The bug this replaces: a fixed two-character slice gave "人，".
    expect(candidateSpan(GEN_1_26, 22, 25)).toBe("人");
  });

  it("is empty on punctuation or past the end", () => {
    expect(candidateSpan(GEN_1_1, 9)).toBe("");
    expect(candidateSpan(GEN_1_1, 99)).toBe("");
    expect(candidateSpan(GEN_1_1, null)).toBe("");
  });

  it("gives every position of a verse in order, deduplicated", () => {
    expect(verseCandidates(GEN_1_1, [3, 0, 5, 2, 3])).toEqual([
      { p: 0, candidate: "起初" },
      { p: 2, candidate: "神" },
      { p: 3, candidate: "创造" },
      { p: 5, candidate: "诸天与地" },
    ]);
  });
});

describe("verifyLemma", () => {
  it("accepts a prefix of the candidate", () => {
    expect(verifyLemma("诸天与地", "诸天")).toBe(true);
    expect(verifyLemma("神", "神")).toBe(true);
  });

  it("rejects anything that is not a prefix", () => {
    // "神创" is the two-character slice this whole pipeline exists to replace.
    expect(verifyLemma("神", "神创")).toBe(false);
    expect(verifyLemma("诸天与地", "天地")).toBe(false);
    expect(verifyLemma("创造", "造")).toBe(false);
  });

  it("rejects empty answers and ones ending on punctuation", () => {
    expect(verifyLemma("人，使", "人，")).toBe(false);
    expect(verifyLemma("起初", "")).toBe(false);
    expect(verifyLemma("起初", null)).toBe(false);
    expect(verifyLemma("", "起初")).toBe(false);
  });
});

describe("parseAnswer", () => {
  it("reads a bare object", () => {
    expect(parseAnswer('{"1":"神"}')).toEqual({ 1: "神" });
  });

  it("survives thinking blocks, fences and chatter", () => {
    expect(parseAnswer('<think>let me see</think>\n```json\n{"1":"起初"}\n```')).toEqual({ 1: "起初" });
    expect(parseAnswer('好的：{"2":"创造"} 希望有帮助')).toEqual({ 2: "创造" });
  });

  it("returns null when there is no object to read", () => {
    expect(parseAnswer("我不确定")).toBeNull();
    expect(parseAnswer("")).toBeNull();
    expect(parseAnswer('["神"]')).toBeNull();
  });
});

describe("applyAnswer", () => {
  const items = [
    { p: 2, candidate: "神" },
    { p: 3, candidate: "创造" },
  ];

  it("keeps answers that verify and drops the rest", () => {
    const res = applyAnswer(items, { 1: "神", 2: "造" });
    expect(res[0]).toMatchObject({ p: 2, w: "神" });
    expect(res[1]).toMatchObject({ p: 3, w: null, answer: "造" });
  });

  it("accepts a reply keyed by position instead of by number", () => {
    expect(applyAnswer(items, { 2: "神", 3: "创造" })[1].w).toBe("创造");
  });

  it("marks every item unresolved when the reply could not be parsed", () => {
    expect(applyAnswer(items, null).every((r) => r.w === null)).toBe(true);
  });
});

describe("buildPrompt", () => {
  it("carries the verse, the candidates and the English hint", () => {
    const prompt = buildPrompt(GEN_1_1, [{ p: 2, candidate: "神", en: "God", l: "2" }]);
    expect(prompt).toContain(GEN_1_1);
    expect(prompt).toContain("「神」");
    expect(prompt).toContain("「God」");
  });

  it("omits the English hint from an item that has none", () => {
    expect(buildPrompt(GEN_1_1, [{ p: 2, candidate: "神" }])).not.toContain("英文：「");
  });
});

describe("sticky characters", () => {
  // The same shape as the real corpus, scaled down: a name whose second half
  // never appears without its first, beside an ordinary word that takes many
  // different characters after it. `repeat` gets each above the minimum number
  // of occurrences the rule insists on before it will move anything.
  const repeat = (lines, times) => Array.from({ length: times }, () => lines).flat();
  const corpus = [
    ...repeat(["耶和华对摩西说", "耶和华的话临到他", "耶和华是我的牧者", "耶和华说，我要作"], 4),
    ...repeat(["神看光是好的", "神说，要有光", "神的灵覆罩在水面上", "神称光为昼"], 4),
  ];

  it("counts how often a word is followed by each character", () => {
    const stats = countFollowers(corpus, ["耶和", "神"]);
    expect(stats.get("耶和").total).toBe(16);
    expect(stats.get("耶和").next.get("华")).toBe(16);
    expect(stats.get("神").next.get("的")).toBe(4);
  });

  it("grows a word that stops inside a name", () => {
    const stats = countFollowers(corpus, ["耶和"]);
    expect(stickyExtension("耶和", "耶和华的话", stats)).toBe("耶和华");
  });

  it("leaves an ordinary word alone", () => {
    const stats = countFollowers(corpus, ["神"]);
    expect(stickyExtension("神", "神的灵", stats)).toBe("神");
  });

  it("leaves a word the corpus barely knows alone", () => {
    // Two occurrences prove nothing, however consistent they look.
    const stats = countFollowers(["耶和华说", "耶和华的"], ["耶和"]);
    expect(stickyExtension("耶和", "耶和华说", stats)).toBe("耶和");
  });

  it("leaves a rare long phrase alone, however consistent its corpus", () => {
    // Every occurrence of this phrase is followed by the same character, but a
    // four-character phrase is prose, not half of a name — growing it produced
    // "带他回来交" the first time this ran over Genesis.
    const rare = repeat(["带他回来交给我", "带他回来交给你"], 10);
    const stats = countFollowers(rare, ["带他回来"]);
    expect(stickyExtension("带他回来", "带他回来交给我", stats)).toBe("带他回来");
  });

  it("never grows past the candidate or across punctuation", () => {
    const stats = countFollowers(corpus, ["耶和", "耶和华"]);
    expect(stickyExtension("耶和", "耶和", stats)).toBe("耶和");
    expect(stickyExtension("耶和", "耶和华，说", stats)).toBe("耶和华");
  });
});

describe("repairTable", () => {
  it("grows the words of a finished table and reports what moved", () => {
    const text = "耶和华对摩西说";
    const table = { "1:1:0": "耶和", "1:1:3": "摩西" };
    const corpus = Array.from({ length: 4 }, () => [
      "耶和华对摩西说",
      "耶和华的话",
      "耶和华是",
      "耶和华说",
    ]).flat();
    const grown = repairTable(table, () => text, corpus);

    expect(table["1:1:0"]).toBe("耶和华");
    expect(table["1:1:3"]).toBe("摩西");
    expect(grown).toEqual([{ key: "1:1:0", from: "耶和", to: "耶和华" }]);
  });

  it("bounds a word by the next marker in the same verse", () => {
    // With a marker at 3 the candidate is "耶和", so there is nothing to grow into.
    const table = { "1:1:0": "耶和", "1:1:2": "华" };
    const corpus = Array.from({ length: 8 }, () => ["耶和华的话", "耶和华说"]).flat();
    const grown = repairTable(table, () => "耶和华对摩西说", corpus);
    expect(table["1:1:0"]).toBe("耶和");
    expect(grown).toEqual([]);
  });
});
