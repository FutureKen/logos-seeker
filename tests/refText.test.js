import { describe, it, expect } from "vitest";
import { refPreview, refAttr, parseRefAttr } from "../src/study/refText.js";

// [book, chapter, verse, en, cn]
const rows = [
  [43, 1, 1, "In the beginning was the Word", "太初有话"],
  [43, 1, 2, "He was in the beginning with God", "这话太初与神同在"],
  [43, 1, 3, "All things came into being through Him", "万物是借着他成的"],
  [43, 1, 4, "In Him was life", "生命在他里面"],
  [19, 3, 0, "A Psalm of David", "大卫的诗"],
  [19, 3, 1, "Jehovah, how many are my adversaries", "耶和华阿，我的敌人何其多"],
];

const bs = {
  verses: rows,
  refMap: new Map(rows.map((r, i) => [`${r[0]}:${r[1]}:${r[2]}`, i])),
};

describe("refPreview", () => {
  it("returns the single verse a plain reference names", () => {
    const p = refPreview(bs, [43, 1, 2, 0], "en");
    expect(p.lines).toEqual([{ no: 2, text: "He was in the beginning with God" }]);
    expect(p.more).toBe(false);
  });

  it("returns the Chinese half when the language is Chinese", () => {
    expect(refPreview(bs, [43, 1, 1, 0], "cn").lines[0].text).toBe("太初有话");
  });

  it("returns a range, and reports when it was cut short", () => {
    const p = refPreview(bs, [43, 1, 1, 4], "en", { maxVerses: 2 });
    expect(p.lines.map((l) => l.no)).toEqual([1, 2]);
    expect(p.more).toBe(true);

    const whole = refPreview(bs, [43, 1, 1, 2], "en");
    expect(whole.lines.map((l) => l.no)).toEqual([1, 2]);
    expect(whole.more).toBe(false);
  });

  it("starts a whole-chapter reference at verse 1", () => {
    const p = refPreview(bs, [43, 1, 0, 0], "en", { maxVerses: 2 });
    expect(p.lines.map((l) => l.no)).toEqual([1, 2]);
    expect(p.more).toBe(true);
  });

  it("starts at the superscription when a chapter has one", () => {
    const p = refPreview(bs, [19, 3, 0, 0], "en", { maxVerses: 2 });
    expect(p.lines.map((l) => l.no)).toEqual([0, 1]);
  });

  it("stops at the end of the chapter rather than running on", () => {
    const p = refPreview(bs, [43, 1, 3, 99], "en", { maxVerses: 10 });
    expect(p.lines.map((l) => l.no)).toEqual([3, 4]);
  });

  it("gives up gracefully on a reference with nothing behind it", () => {
    expect(refPreview(bs, [43, 99, 1, 0], "en")).toBeNull();
    expect(refPreview(bs, null, "en")).toBeNull();
    expect(refPreview({}, [43, 1, 1, 0], "en")).toBeNull();
  });

  it("stops once it has enough characters", () => {
    const p = refPreview(bs, [43, 1, 1, 4], "en", { maxVerses: 9, maxChars: 10 });
    expect(p.lines).toHaveLength(1);
    expect(p.more).toBe(true);
  });
});

describe("refAttr / parseRefAttr", () => {
  it("round-trips a reference", () => {
    expect(refAttr([43, 1, 1, 2])).toBe("43:1:1:2");
    expect(parseRefAttr("43:1:1:2")).toEqual([43, 1, 1, 2]);
    expect(refAttr([43, 1, 0, 0])).toBe("43:1:0:0");
  });

  it("rejects anything malformed", () => {
    expect(parseRefAttr("")).toBeNull();
    expect(parseRefAttr("43:1")).toBeNull();
    expect(parseRefAttr("43:x:1")).toBeNull();
    expect(parseRefAttr(undefined)).toBeNull();
    expect(refAttr(null)).toBeUndefined();
  });
});
