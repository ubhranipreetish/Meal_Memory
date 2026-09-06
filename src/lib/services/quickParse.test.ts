import { describe, expect, it } from "vitest";
import {
  aliasCandidates,
  normalizeAlias,
  quickParseSegments,
  quickParseWater,
} from "./quickParse";

describe("normalizeAlias", () => {
  it("lowercases, strips punctuation, collapses spaces", () => {
    expect(normalizeAlias("  Mom's  Paneer   Paratha! ")).toBe("mom's paneer paratha");
  });
});

describe("aliasCandidates", () => {
  it("adds singular variants", () => {
    expect(aliasCandidates("aloo parathas")).toContain("aloo paratha");
    expect(aliasCandidates("Rotis")).toContain("roti");
  });
});

describe("quickParseSegments", () => {
  it("parses qty + name", () => {
    const s = quickParseSegments("2 aloo parathas")!;
    expect(s).toHaveLength(1);
    expect(s[0].qty).toBe(2);
    expect(s[0].namePart).toBe("aloo parathas");
  });

  it("parses number words and 'a'", () => {
    const s = quickParseSegments("two rotis and a glass of milk")!;
    expect(s).toHaveLength(2);
    expect(s[0].qty).toBe(2);
    expect(s[1].qty).toBe(1);
    expect(s[1].unit).toBe("glass");
    expect(s[1].namePart).toBe("milk");
  });

  it("parses half bowl", () => {
    const s = quickParseSegments("half bowl dal")!;
    expect(s[0].qty).toBe(0.5);
    expect(s[0].unit).toBe("bowl");
    expect(s[0].namePart).toBe("dal");
  });

  it("strips 'I ate' prefix", () => {
    const s = quickParseSegments("I ate 3 idlis")!;
    expect(s[0].qty).toBe(3);
    expect(s[0].namePart).toBe("idlis");
  });

  it("understands Hinglish number words (voice transcripts)", () => {
    const s = quickParseSegments("char boiled egg")!;
    expect(s[0].qty).toBe(4);
    expect(s[0].namePart).toBe("boiled egg");
    expect(quickParseSegments("do roti and aadha bowl dal")![1].qty).toBe(0.5);
    expect(quickParseSegments("dedh katori chawal")![0].qty).toBe(1.5);
    // katori is understood on input but folds into the one supported word, bowl
    expect(quickParseSegments("dedh katori chawal")![0].unit).toBe("bowl");
  });

  it("does not eat food names that start with a number word", () => {
    // "dosa" must not be read as Hindi "do" (2)
    expect(quickParseSegments("dosa")![0].namePart).toBe("dosa");
    expect(quickParseSegments("dosa")![0].qty).toBe(1);
  });

  it("parses measured units (g / ml) as qty in grams/ml", () => {
    const a = quickParseSegments("250 ml milk")!;
    expect(a[0]).toMatchObject({ qty: 250, unit: "ml", namePart: "milk" });
    const b = quickParseSegments("200g chicken breast")!;
    expect(b[0]).toMatchObject({ qty: 200, unit: "g", namePart: "chicken breast" });
    const c = quickParseSegments("2 tbsp peanut butter")!;
    expect(c[0]).toMatchObject({ qty: 2, unit: "tbsp", namePart: "peanut butter" });
  });

  it("bare name defaults to qty 1", () => {
    const s = quickParseSegments("paneer paratha")!;
    expect(s[0].qty).toBe(1);
    expect(s[0].namePart).toBe("paneer paratha");
  });

  it("splits on comma and plus", () => {
    const s = quickParseSegments("2 rotis, 1 bowl sabzi + 1 glass lassi")!;
    expect(s).toHaveLength(3);
  });
});

describe("quickParseWater", () => {
  it("parses litres", () => {
    expect(quickParseWater("drank 1l water")?.ml).toBe(1000);
    expect(quickParseWater("drank 1.5 litre water")?.ml).toBe(1500);
  });
  it("parses ml", () => {
    expect(quickParseWater("500ml water")?.ml).toBe(500);
  });
  it("parses glasses at 250ml", () => {
    expect(quickParseWater("2 glasses of water")?.ml).toBe(500);
  });
  it("returns null when other food present", () => {
    expect(quickParseWater("water and 2 rotis")).toBeNull();
  });
  it("returns null when no water", () => {
    expect(quickParseWater("2 rotis")).toBeNull();
  });
});
