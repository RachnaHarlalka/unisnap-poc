// Timing and counting for one run of an operation (a scan, a comparison, a trash batch).
// Pure: the clock is passed in, so this works in a browser, on a phone and in plain Node tests.

export interface Clock {
  /** Monotonic milliseconds, for measuring durations (for example performance.now). */
  now(): number;
  /** Wall-clock milliseconds since epoch, for saying when a run started. */
  wall(): number;
}

export interface SpanStats {
  count: number;
  totalMs: number;
  meanMs: number;
  minMs: number;
  maxMs: number;
  /** Median, nearest-rank, over the first 100000 samples. */
  p50Ms: number;
  p95Ms: number;
}

export type NoteValue = string | number | boolean;

export interface RunReport {
  kind: string;
  build: string;
  startedAt: number;
  startedIso: string;
  durationMs: number;
  counters: Record<string, number>;
  spans: Record<string, SpanStats>;
  notes: Record<string, NoteValue>;
}

export interface Recorder {
  /** Time an async or sync function. Records the duration even when it throws, then rethrows. */
  time<T>(name: string, fn: () => T | Promise<T>): Promise<T>;
  timeSync<T>(name: string, fn: () => T): T;
  /** Record a duration measured elsewhere. */
  add(name: string, ms: number): void;
  count(name: string, n?: number): void;
  /** Text notes have e-mail addresses replaced, so a report is safe to keep in a repository. */
  note(key: string, value: NoteValue): void;
  /** A view that prefixes every name, for example "A." for one account. */
  scope(prefix: string): Recorder;
}

export interface Run extends Recorder {
  finish(): RunReport;
}

const MAX_SAMPLES = 100_000;
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;

export const redact = (s: string): string => s.replace(EMAIL, "<email>");

interface Acc {
  count: number;
  total: number;
  min: number;
  max: number;
  samples: number[];
}

const percentile = (sorted: number[], p: number): number => (sorted.length ? sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)] : 0);

export function startRun(kind: string, clock: Clock, build: string): Run {
  const t0 = clock.now();
  const wall0 = clock.wall();
  const spans = new Map<string, Acc>();
  const counters = new Map<string, number>();
  const notes: Record<string, NoteValue> = {};

  const addSpan = (name: string, ms: number) => {
    let a = spans.get(name);
    if (!a) spans.set(name, (a = { count: 0, total: 0, min: Infinity, max: 0, samples: [] }));
    a.count++;
    a.total += ms;
    a.min = Math.min(a.min, ms);
    a.max = Math.max(a.max, ms);
    if (a.samples.length < MAX_SAMPLES) a.samples.push(ms);
  };

  const make = (prefix: string): Recorder => ({
    async time<T>(name: string, fn: () => T | Promise<T>): Promise<T> {
      const s = clock.now();
      try {
        return await fn();
      } finally {
        addSpan(prefix + name, clock.now() - s);
      }
    },
    timeSync<T>(name: string, fn: () => T): T {
      const s = clock.now();
      try {
        return fn();
      } finally {
        addSpan(prefix + name, clock.now() - s);
      }
    },
    add: (name, ms) => addSpan(prefix + name, ms),
    count: (name, n = 1) => void counters.set(prefix + name, (counters.get(prefix + name) ?? 0) + n),
    note: (key, value) => void (notes[prefix + key] = typeof value === "string" ? redact(value) : value),
    scope: (p) => make(`${prefix}${p}.`),
  });

  return {
    ...make(""),
    finish(): RunReport {
      const out: Record<string, SpanStats> = {};
      for (const [name, a] of spans) {
        const sorted = [...a.samples].sort((x, y) => x - y);
        out[name] = { count: a.count, totalMs: a.total, meanMs: a.total / a.count, minMs: a.min, maxMs: a.max, p50Ms: percentile(sorted, 50), p95Ms: percentile(sorted, 95) };
      }
      return {
        kind,
        build,
        startedAt: wall0,
        startedIso: new Date(wall0).toISOString(),
        durationMs: clock.now() - t0,
        counters: Object.fromEntries(counters),
        spans: out,
        notes: { ...notes },
      };
    },
  };
}

/** Time `fn` when a recorder is given, otherwise just run it. Lets library code take an optional recorder. */
export const timed = <T>(rec: Recorder | undefined, name: string, fn: () => T | Promise<T>): Promise<T> =>
  rec ? rec.time(name, fn) : (async () => fn())();

/** Add another report's spans under a prefix, for example the screen-drawing time collected since the last report. */
export const mergeSpans = (report: RunReport, spans: Record<string, SpanStats>, prefix: string): RunReport => ({
  ...report,
  spans: { ...report.spans, ...Object.fromEntries(Object.entries(spans).map(([k, v]) => [prefix + k, v])) },
});

export function formatMs(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(ms < 10 ? 2 : 1)} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(2)} s`;
  const m = Math.floor(s / 60);
  return `${m} min ${(s - m * 60).toFixed(1)} s`;
}

const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

/** One line for a console log. */
export function summaryLine(r: RunReport): string {
  const top = Object.entries(r.counters).slice(0, 4).map(([k, v]) => `${k} ${num(v)}`);
  return [`${r.kind} took ${formatMs(r.durationMs)}`, ...top].join(" · ");
}

/** A readable report with the full data as JSON at the end. */
export function formatReportMarkdown(r: RunReport): string {
  const sec = r.durationMs / 1000;
  const lines: string[] = [
    `# Run report: ${r.kind}`,
    "",
    "| | |",
    "| --- | --- |",
    `| Build | ${r.build} |`,
    `| Started | ${r.startedIso} |`,
    `| Duration | ${formatMs(r.durationMs)} |`,
  ];
  const notes = Object.entries(r.notes);
  if (notes.length) lines.push("", "## Notes", "", "| Note | Value |", "| --- | --- |", ...notes.map(([k, v]) => `| ${k} | ${String(v).replace(/\|/g, "\\|")} |`));
  const counters = Object.entries(r.counters);
  if (counters.length)
    lines.push("", "## Counters", "", "| Counter | Total | Per second |", "| --- | --- | --- |", ...counters.map(([k, v]) => `| ${k} | ${num(v)} | ${sec > 0 ? num(v / sec) : "-"} |`));
  const spans = Object.entries(r.spans).sort((a, b) => b[1].totalMs - a[1].totalMs);
  if (spans.length) {
    lines.push("", "## Timings", "", "| Span | Count | Total | Mean | p50 | p95 | Max |", "| --- | --- | --- | --- | --- | --- | --- |");
    for (const [k, s] of spans) lines.push(`| ${k} | ${s.count} | ${formatMs(s.totalMs)} | ${formatMs(s.meanMs)} | ${formatMs(s.p50Ms)} | ${formatMs(s.p95Ms)} | ${formatMs(s.maxMs)} |`);
    lines.push("", "Spans can overlap (two accounts run in parallel), so their totals can add up to more than the duration. Waiting spans (`pause`, `retry-wait`) are time the app chose to wait, not work.");
  }
  lines.push("", "## Raw data", "", "```json", JSON.stringify(r, null, 2), "```", "");
  return lines.join("\n");
}
