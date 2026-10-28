import { describe, expect, it } from "vitest";
import { BURST_MIN_GAP_MS, buildGroups, KEEP_RULES, keepFor } from "../groups";
import { item, row, video } from "./fixtures";

describe("buildGroups", () => {
  it("burst threshold is pinned", () => expect(BURST_MIN_GAP_MS).toBe(50));

  it("an identical file across accounts is an exact group", () => {
    const a = item("A", "a1", { dedupKey: "k" });
    const b = item("B", "b1", { dedupKey: "k" });
    const [g] = buildGroups([row(a, b, 0)]);
    expect(g).toMatchObject({ kind: "exact", maxDistance: 0, maxGapMs: 0, accounts: ["A", "B"], hasVideo: false });
    expect(g.items).toHaveLength(2);
  });

  it("a resized copy (<= 6 bits, same time, trusted) is similar", () => {
    const [g] = buildGroups([row(item("A", "a1"), item("B", "b1"), 3)]);
    expect(g.kind).toBe("similar");
    expect(g.maxDistance).toBe(3);
  });

  it("7 to 12 bits is 'alike', never similar", () => {
    expect(buildGroups([row(item("A", "a1"), item("B", "b1"), 7)])[0].kind).toBe("alike");
    expect(buildGroups([row(item("A", "a1"), item("B", "b1"), 12)])[0].kind).toBe("alike");
  });

  it("a near match whose capture time is not trusted is 'alike'", () => {
    const [g] = buildGroups([row(item("A", "a1"), item("B", "b1"), 2, { timeTrusted: false })]);
    expect(g.kind).toBe("alike");
  });

  it("more than 50 ms apart is a burst, 50 ms is not", () => {
    expect(buildGroups([row(item("A", "a1"), item("B", "b1"), 2, { deltaMs: 51 })])[0].kind).toBe("burst");
    expect(buildGroups([row(item("A", "a1"), item("B", "b1"), 2, { deltaMs: 50 })])[0].kind).toBe("similar");
  });

  it("burst beats alike when both apply", () => {
    expect(buildGroups([row(item("A", "a1"), item("B", "b1"), 10, { deltaMs: 400 })])[0].kind).toBe("burst");
  });

  it("pairs that are different, or not scored yet, form no group", () => {
    expect(buildGroups([row(item("A", "a1"), item("B", "b1"), 13), row(item("A", "a2"), item("B", "b2"), undefined)])).toEqual([]);
  });

  it("an exact pair plus a near pair sharing an item makes one similar group", () => {
    const a1 = item("A", "a1", { dedupKey: "k" });
    const b1 = item("B", "b1", { dedupKey: "k" });
    const b2 = item("B", "b2");
    const gs = buildGroups([row(a1, b1, 0), row(b1, b2, 4)]);
    expect(gs).toHaveLength(1);
    expect(gs[0].kind).toBe("similar");
    expect(gs[0].items.map((i) => i.mediaKey)).toEqual(["a1", "b1", "b2"]);
  });

  it("chains frames into a single group (known behaviour, see FINDINGS)", () => {
    const f = [1, 2, 3, 4].map((n) => item(n % 2 ? "A" : "B", `f${n}`));
    const gs = buildGroups([row(f[0], f[1], 8, { deltaMs: 150 }), row(f[1], f[2], 9, { deltaMs: 300 }), row(f[2], f[3], 11, { deltaMs: 1350 })]);
    expect(gs).toHaveLength(1);
    expect(gs[0]).toMatchObject({ kind: "burst", maxDistance: 11, maxGapMs: 1350 });
    expect(gs[0].items).toHaveLength(4);
  });

  it("one account only is reported as a single-account group", () => {
    const [g] = buildGroups([row(item("A", "a1", { dedupKey: "k" }), item("A", "a2", { dedupKey: "k" }), 0)]);
    expect(g.accounts).toEqual(["A"]);
  });

  it("flags groups containing a video", () => {
    const [g] = buildGroups([row(video("A", "a1", 5000), video("B", "b1", 5200), 1)]);
    expect(g.hasVideo).toBe(true);
  });

  it("orders groups exact, similar, alike, burst, then larger first", () => {
    const mk = (k: string, d: number, o = {}) => row(item("A", `${k}a`), item("B", `${k}b`), d, o);
    const rows = [
      mk("burst", 3, { deltaMs: 200 }),
      mk("alike", 9),
      mk("sim", 2),
      row(item("A", "ea", { dedupKey: "k" }), item("B", "eb", { dedupKey: "k" }), 0),
      // a bigger similar group (3 items)
      row(item("A", "s3a"), item("B", "s3b"), 1),
      row(item("B", "s3b"), item("B", "s3c"), 1),
    ];
    // groups are keyed by account + mediaKey, so the two s3b rows join into one group of 3
    expect(buildGroups(rows).map((g) => [g.kind, g.items.length])).toEqual([
      ["exact", 2],
      ["similar", 3],
      ["similar", 2],
      ["alike", 2],
      ["burst", 2],
    ]);
  });

  describe("suggested keep", () => {
    it("is the most pixels, then the earliest upload", () => {
      const big = item("A", "big", { width: 1600, height: 1200, uploadTime: 900 });
      const small = item("B", "small", { uploadTime: 100 });
      expect(buildGroups([row(big, small, 1)])[0].keep).toBe(big);
      const x = item("A", "x", { uploadTime: 300 });
      const y = item("B", "y", { uploadTime: 200 });
      expect(buildGroups([row(x, y, 0, { sameDedupKey: true })])[0].keep).toBe(y);
    });
  });

  it("sorts items by account, then capture time", () => {
    const b = item("B", "b", { captureTime: 5 });
    const a2 = item("A", "a2", { captureTime: 20 });
    const a1 = item("A", "a1", { captureTime: 10 });
    const [g] = buildGroups([row(b, a2, 1), row(a2, a1, 1)]);
    expect(g.items.map((i) => i.mediaKey)).toEqual(["a1", "a2", "b"]);
  });
});

describe("keepFor", () => {
  const a = item("A", "a", { width: 1600, height: 1200, uploadTime: 300 });
  const b = item("B", "b", { width: 800, height: 600, uploadTime: 100 });
  const c = item("B", "c", { width: 800, height: 600, uploadTime: 200 });
  const [g] = buildGroups([row(a, b, 1), row(b, c, 1)]);

  it("largest and the default suggestion", () => {
    expect(keepFor(g, "largest")).toBe(a);
  });
  it("smallest: fewest pixels, then earliest upload", () => expect(keepFor(g, "smallest")).toBe(b));
  it("oldest / newest by upload time", () => {
    expect(keepFor(g, "oldest")).toBe(b);
    expect(keepFor(g, "newest")).toBe(a);
  });
  it("A / B keep the best copy inside that account", () => {
    expect(keepFor(g, "A")).toBe(a);
    expect(keepFor(g, "B")).toBe(b);
  });
  it("falls back to the default when the account has no copy", () => {
    const [onlyB] = buildGroups([row(b, c, 1)]);
    expect(keepFor(onlyB, "A")).toBe(onlyB.keep);
  });
  it("lists the six rules in order", () => {
    expect(KEEP_RULES.map((r) => r.value)).toEqual(["largest", "smallest", "A", "B", "oldest", "newest"]);
  });
});
