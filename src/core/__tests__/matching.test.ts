import { describe, expect, it } from "vitest";
import { hamming, MATCH_MAX_DISTANCE, SIMILAR_MAX_DISTANCE } from "../fingerprint";
import { classify, rowsFromStored } from "../matching";
import { item, row } from "./fixtures";

describe("hamming", () => {
  it("counts differing bits of two 16-hex-char hashes", () => {
    expect(hamming("0000000000000000", "0000000000000000")).toBe(0);
    expect(hamming("0000000000000001", "0000000000000000")).toBe(1);
    expect(hamming("ffffffffffffffff", "0000000000000000")).toBe(64);
    expect(hamming("00000000000000ff", "000000000000000f")).toBe(4);
    expect(hamming("8000000000000000", "0000000000000001")).toBe(2);
  });
  it("is symmetric", () => {
    expect(hamming("123456789abcdef0", "0fedcba987654321")).toBe(hamming("0fedcba987654321", "123456789abcdef0"));
  });
});

describe("classify", () => {
  const a = item("A", "a1");
  const b = item("B", "b1");
  it("thresholds are pinned", () => {
    expect(MATCH_MAX_DISTANCE).toBe(6);
    expect(SIMILAR_MAX_DISTANCE).toBe(12);
  });
  it("same dedupKey is exact whatever the distance", () => {
    expect(classify(row({ ...a, dedupKey: "k" }, { ...b, dedupKey: "k" }, 40))).toBe("exact");
    expect(classify(row({ ...a, dedupKey: "k" }, { ...b, dedupKey: "k" }, undefined))).toBe("exact");
  });
  it("is undefined while the distance is unknown", () => {
    expect(classify(row(a, b, undefined))).toBeUndefined();
  });
  it("0 to 6 bits is near, 7 to 12 similar, 13 and up different", () => {
    const at = (d: number) => classify(row(a, b, d));
    expect([at(0), at(6)]).toEqual(["near", "near"]);
    expect([at(7), at(12)]).toEqual(["similar", "similar"]);
    expect([at(13), at(64)]).toEqual(["different", "different"]);
  });
});

describe("rowsFromStored", () => {
  it("builds candidate rows and scores pairs whose two hashes are stored", () => {
    const a1 = item("A", "a1", { dhash: "0000000000000000" });
    const b1 = item("B", "b1", { dhash: "000000000000000f" });
    const rows = rowsFromStored({ A: [a1], B: [b1] });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ hashA: "0000000000000000", hashB: "000000000000000f", distance: 4 });
  });
  it("leaves the distance unknown when either hash is missing", () => {
    const rows = rowsFromStored({ A: [item("A", "a1", { dhash: "0000000000000000" })], B: [item("B", "b1")] });
    expect(rows[0].distance).toBeUndefined();
  });
});
