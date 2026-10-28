// Baseline: pins what findCandidates does today. Characterisation tests, not a statement of what is ideal.
import { describe, expect, it } from "vitest";
import { findCandidates, MAX_ASPECT_DIFF, MAX_DURATION_DIFF_MS, MAX_TIME_DELTA_MS, SHARED_TIME_LIMIT } from "../candidates";
import { item, video } from "./fixtures";

const T = 1_000_000;

describe("thresholds", () => {
  it("are pinned", () => {
    expect(MAX_TIME_DELTA_MS).toBe(2000);
    expect(MAX_ASPECT_DIFF).toBe(0.02);
    expect(MAX_DURATION_DIFF_MS).toBe(1000);
    expect(SHARED_TIME_LIMIT).toBe(3);
  });
});

describe("findCandidates", () => {
  it("pairs an exact copy across accounts", () => {
    const out = findCandidates([item("A", "a1", { dedupKey: "k" })], [item("B", "b1", { dedupKey: "k" })]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ deltaMs: 0, aspectDiff: 0, sameDedupKey: true, timeTrusted: true });
  });

  it("pairs a resized copy: different key, same time, same shape", () => {
    const out = findCandidates([item("A", "a1", { width: 1600, height: 1200 })], [item("B", "b1", { width: 800, height: 600 })]);
    expect(out).toHaveLength(1);
    expect(out[0].sameDedupKey).toBe(false);
  });

  it("treats a missing dedupKey as not the same key", () => {
    const out = findCandidates([item("A", "a1", { dedupKey: undefined })], [item("B", "b1", { dedupKey: undefined })]);
    expect(out[0].sameDedupKey).toBe(false);
  });

  it("allows a time gap of exactly 2000 ms and refuses 2001 ms", () => {
    expect(findCandidates([item("A", "a1")], [item("B", "b1", { captureTime: T + 2000 })])).toHaveLength(1);
    expect(findCandidates([item("A", "a1")], [item("B", "b1", { captureTime: T + 2001 })])).toHaveLength(0);
  });

  it("uses the absolute time gap", () => {
    const out = findCandidates([item("A", "a1", { captureTime: T + 700 })], [item("B", "b1")]);
    expect(out[0].deltaMs).toBe(700);
  });

  it("accepts an aspect difference inside 2% and refuses one outside", () => {
    const base = item("A", "a1", { width: 900, height: 600 }); // 1.5
    const near = item("B", "b1", { width: 888, height: 600 }); // 1.48, 1.3% apart
    const far = item("B", "b2", { width: 840, height: 600 }); // 1.4, 6.7% apart
    const out = findCandidates([base], [near, far]);
    expect(out.map((c) => c.b.mediaKey)).toEqual(["b1"]);
    expect(out[0].aspectDiff).toBeCloseTo(0.02 / 1.5, 10);
  });

  it("compares width over height as stored, so a rotated copy does not pair", () => {
    expect(findCandidates([item("A", "a1", { width: 800, height: 600 })], [item("B", "b1", { width: 600, height: 800 })])).toHaveLength(0);
  });

  it("skips items the account does not own, but not items with unknown ownership", () => {
    expect(findCandidates([item("A", "a1", { isOwned: false })], [item("B", "b1")])).toHaveLength(0);
    expect(findCandidates([item("A", "a1", { isOwned: undefined })], [item("B", "b1")])).toHaveLength(1);
  });

  it("skips items with no capture time or no size", () => {
    expect(findCandidates([item("A", "a1", { captureTime: undefined })], [item("B", "b1")])).toHaveLength(0);
    expect(findCandidates([item("A", "a1", { width: undefined })], [item("B", "b1")])).toHaveLength(0);
    expect(findCandidates([item("A", "a1", { height: 0 })], [item("B", "b1")])).toHaveLength(0);
  });

  it("pairs same-account duplicates too", () => {
    const out = findCandidates([item("A", "a1"), item("A", "a2")], []);
    expect(out).toHaveLength(1);
    expect([out[0].a.account, out[0].b.account]).toEqual(["A", "A"]);
  });

  it("never pairs an item with itself and pairs each unordered pair once", () => {
    const out = findCandidates([item("A", "a1"), item("A", "a2"), item("A", "a3")], []);
    expect(out.map((c) => `${c.a.mediaKey}-${c.b.mediaKey}`)).toEqual(["a1-a2", "a1-a3", "a2-a3"]);
  });

  describe("shared capture times", () => {
    it("trusts a time shared by 2 photos in an account", () => {
      const out = findCandidates([item("A", "a1"), item("A", "a2")], [item("B", "b1", { captureTime: T + 10 })]);
      expect(out.every((c) => c.timeTrusted)).toBe(true);
    });

    it("distrusts a time shared by 3 photos in one account", () => {
      const as = [item("A", "a1"), item("A", "a2"), item("A", "a3")];
      const out = findCandidates(as, [item("B", "b1")]);
      const cross = out.filter((c) => c.a.account !== c.b.account);
      expect(cross).toHaveLength(3);
      expect(cross.every((c) => !c.timeTrusted)).toBe(true);
    });

    it("counts a shared time per account, not across accounts", () => {
      const out = findCandidates([item("A", "a1"), item("A", "a2")], [item("B", "b1"), item("B", "b2")]);
      expect(out.every((c) => c.timeTrusted)).toBe(true);
    });
  });

  describe("videos", () => {
    it("never pairs a video with a photo", () => {
      expect(findCandidates([video("A", "a1", 5000)], [item("B", "b1")])).toHaveLength(0);
    });
    it("pairs two videos whose lengths differ by up to 1000 ms and refuses 1001 ms", () => {
      expect(findCandidates([video("A", "a1", 5000)], [video("B", "b1", 6000)])).toHaveLength(1);
      expect(findCandidates([video("A", "a1", 5000)], [video("B", "b1", 6001)])).toHaveLength(0);
    });
    it("treats a duration of 0 as a video", () => {
      expect(findCandidates([video("A", "a1", 0)], [item("B", "b1")])).toHaveLength(0);
    });
  });

  describe("order", () => {
    it("sorts by time gap, smallest first", () => {
      const out = findCandidates([item("A", "a1")], [item("B", "far", { captureTime: T + 1500 }), item("B", "near", { captureTime: T + 100 })]);
      const cross = out.filter((c) => c.a.account === "A" && c.b.account === "B");
      expect(cross.map((c) => c.b.mediaKey)).toEqual(["near", "far"]);
      expect(out.map((c) => c.deltaMs)).toEqual([...out.map((c) => c.deltaMs)].sort((x, y) => x - y));
    });
    it("on equal gaps lists cross-account pairs first, then A-A, then B-B", () => {
      const out = findCandidates([item("A", "a1"), item("A", "a2")], [item("B", "b1"), item("B", "b2")]);
      expect(out.map((c) => `${c.a.mediaKey}-${c.b.mediaKey}`)).toEqual(["a1-b1", "a1-b2", "a2-b1", "a2-b2", "a1-a2", "b1-b2"]);
    });
  });
});
