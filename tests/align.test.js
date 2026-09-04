import { describe, it, expect } from "vitest";
import { normalizeEn, normalizeCn, mapOffsets } from "../scripts/lib/align.mjs";

describe("normalizeEn", () => {
  it("straightens quotes, drops poetry line marks and collapses whitespace", () => {
    expect(normalizeEn("He said, “Come” / and I ‘went’.")).toBe(`He said, "Come" and I 'went'.`);
    expect(normalizeEn("  a\n\n b  ")).toBe("a b");
  });
});

describe("normalizeCn", () => {
  it("strips every kind of whitespace", () => {
    expect(normalizeCn("而地变为荒废空虚，　渊面黑暗。 神的灵")).toBe("而地变为荒废空虚，渊面黑暗。神的灵");
  });
});

describe("mapOffsets", () => {
  const s = "In the beginning God created the heavens and the earth.";

  it("identical strings map exactly", () => {
    expect(mapOffsets(s, s, [0, 7, 17])).toEqual([
      { pos: 0, how: "exact" },
      { pos: 7, how: "exact" },
      { pos: 17, how: "exact" },
    ]);
  });

  it("maps through an inserted word with how='diff'", () => {
    const dst = "In the very beginning God created the heavens and the earth.";
    const got = mapOffsets(s, dst, [0, 7, 17]);
    expect(got[0]).toEqual({ pos: 0, how: "diff" });
    expect(dst.slice(got[1].pos, got[1].pos + 9)).toBe("beginning");
    expect(dst.slice(got[2].pos, got[2].pos + 3)).toBe("God");
  });

  it("returns null when the offset falls in a span that has no counterpart", () => {
    expect(mapOffsets("abc XYZ", "abc", [4])).toEqual([{ pos: null, how: "none" }]);
  });

  it("snaps to the next anchored position when the next 3 characters match", () => {
    const src = "aaaXbcdef";
    const dst = "aaabcdef";
    const [got] = mapOffsets(src, dst, [3]); // the "X" itself is gone
    expect(got).toEqual({ pos: 3, how: "snap" });
    expect(dst.slice(3, 6)).toBe("bcd");
  });

  it("passes null offsets through", () => {
    expect(mapOffsets(s, s, [null])).toEqual([{ pos: null, how: "none" }]);
  });

  it("maps an end-of-string offset", () => {
    expect(mapOffsets(s, s, [s.length])).toEqual([{ pos: s.length, how: "exact" }]);
  });
});
