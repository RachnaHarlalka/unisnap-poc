import { describe, expect, it } from "vitest";
import { formatMs, formatReportMarkdown, mergeSpans, redact, startRun, summaryLine, timed } from "../src";
import type { Clock } from "../src";

// A clock the test moves by hand.
const fakeClock = () => {
  let t = 0;
  const clock: Clock = { now: () => t, wall: () => Date.UTC(2026, 9, 28, 12, 0, 0) + t };
  return { clock, tick: (ms: number) => void (t += ms) };
};

describe("startRun", () => {
  it("times async work and reports count, total, mean, min, max", async () => {
    const { clock, tick } = fakeClock();
    const run = startRun("scan", clock, "abc123");
    for (const ms of [10, 20, 30]) await run.time("page", async () => tick(ms));
    tick(5);
    const r = run.finish();
    expect(r.durationMs).toBe(65);
    expect(r.spans.page).toMatchObject({ count: 3, totalMs: 60, meanMs: 20, minMs: 10, maxMs: 30 });
    expect(r.build).toBe("abc123");
    expect(r.startedIso).toBe("2026-10-28T12:00:00.000Z");
  });

  it("uses nearest-rank percentiles", async () => {
    const { clock } = fakeClock();
    const run = startRun("x", clock, "b");
    for (let i = 1; i <= 100; i++) run.add("s", i);
    expect(run.finish().spans.s).toMatchObject({ p50Ms: 50, p95Ms: 95, maxMs: 100 });
  });

  it("records a span even when the function throws, and rethrows", async () => {
    const { clock, tick } = fakeClock();
    const run = startRun("x", clock, "b");
    await expect(run.time("boom", async () => { tick(7); throw new Error("no"); })).rejects.toThrow("no");
    expect(() => run.timeSync("boom", () => { tick(3); throw new Error("sync"); })).toThrow("sync");
    expect(run.finish().spans.boom).toMatchObject({ count: 2, totalMs: 10 });
  });

  it("counts, notes, and scopes names with a prefix", () => {
    const { clock } = fakeClock();
    const run = startRun("scan", clock, "b");
    const a = run.scope("A");
    a.count("pages");
    a.count("pages", 2);
    a.scope("verify").count("items", 5);
    a.note("accounts", 2);
    a.add("page", 4);
    const r = run.finish();
    expect(r.counters).toEqual({ "A.pages": 3, "A.verify.items": 5 });
    expect(r.notes).toEqual({ "A.accounts": 2 });
    expect(r.spans["A.page"].totalMs).toBe(4);
  });

  it("removes e-mail addresses from text notes", () => {
    const { clock } = fakeClock();
    const run = startRun("trash", clock, "b");
    run.note("error", "Tab is signed in as someone.name+x@gmail.com, expected other@example.co.uk");
    expect(run.finish().notes.error).toBe("Tab is signed in as <email>, expected <email>");
    expect(redact("no address here")).toBe("no address here");
  });
});

describe("timed", () => {
  it("runs the function with or without a recorder", async () => {
    const { clock, tick } = fakeClock();
    const run = startRun("x", clock, "b");
    expect(await timed(undefined, "a", () => 1)).toBe(1);
    expect(await timed(run, "a", async () => { tick(2); return 2; })).toBe(2);
    expect(run.finish().spans.a.count).toBe(1);
  });
});

describe("mergeSpans", () => {
  it("adds spans under a prefix without touching the rest", () => {
    const { clock } = fakeClock();
    const r = startRun("x", clock, "b").finish();
    const other = startRun("ui", clock, "b");
    other.add("draw", 3);
    const merged = mergeSpans(r, other.finish().spans, "ui.");
    expect(Object.keys(merged.spans)).toEqual(["ui.draw"]);
  });
});

describe("formatting", () => {
  it("formats durations", () => {
    expect(formatMs(0.5)).toBe("0.50 ms");
    expect(formatMs(250)).toBe("250.0 ms");
    expect(formatMs(2500)).toBe("2.50 s");
    expect(formatMs(192_400)).toBe("3 min 12.4 s");
  });

  it("writes a markdown report with the tables and the raw data", async () => {
    const { clock, tick } = fakeClock();
    const run = startRun("find-duplicates", clock, "abc+dirty");
    run.note("photos", 400);
    run.count("photos-hashed", 50);
    await run.time("fetch-thumbnail", async () => tick(1000));
    tick(1000);
    const md = formatReportMarkdown(run.finish());
    expect(md).toContain("# Run report: find-duplicates");
    expect(md).toContain("| Build | abc+dirty |");
    expect(md).toContain("| photos-hashed | 50 | 25 |"); // 50 over 2 s
    expect(md).toContain("| fetch-thumbnail | 1 | 1.00 s |");
    expect(md).toContain("```json");
  });

  it("summarises a run on one line", () => {
    const { clock, tick } = fakeClock();
    const run = startRun("scan", clock, "b");
    run.count("items", 2308);
    tick(4000);
    expect(summaryLine(run.finish())).toBe("scan took 4.00 s · items 2308");
  });
});
