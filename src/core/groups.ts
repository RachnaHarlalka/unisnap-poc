import type { Label } from "./types";
import type { ItemRow } from "./types";
import { classify } from "./matching";
import type { Row } from "./matching";

// Capture times of a re-saved or resized copy are identical (0 ms in the seed set); different frames of a
// burst were at least 150 ms apart. 50 ms separates them there. Caveat: an editor that drops sub-second
// EXIF data can shift a copy by up to ~1 s, and a real burst inside one second can show 0 ms, so this
// rule alone is not safe for real libraries.
export const BURST_MIN_GAP_MS = 50;

export type GroupKind = "exact" | "similar" | "burst";

export interface Group {
  id: string;
  kind: GroupKind;
  items: ItemRow[];
  maxDistance: number;
  maxGapMs: number;
  keep: ItemRow; // suggestion only, nothing is deleted in the POC
  accounts: Label[]; // one entry = duplicates inside a single account
}

const key = (i: ItemRow) => `${i.account}:${i.mediaKey}`;
const pixels = (i: ItemRow) => (i.width ?? 0) * (i.height ?? 0);

// Connect every pair that matched (exact, near-identical or similar) into groups of copies.
export function buildGroups(rows: Row[]): Group[] {
  const parent = new Map<string, string>();
  const byKey = new Map<string, ItemRow>();
  const find = (k: string): string => {
    while (parent.get(k) !== k) {
      parent.set(k, parent.get(parent.get(k)!)!);
      k = parent.get(k)!;
    }
    return k;
  };
  const edges = rows.filter((r) => ["exact", "near", "similar"].includes(classify(r) ?? ""));
  for (const r of edges) {
    for (const it of [r.c.a, r.c.b]) {
      byKey.set(key(it), it);
      if (!parent.has(key(it))) parent.set(key(it), key(it));
    }
    parent.set(find(key(r.c.a)), find(key(r.c.b)));
  }

  const comps = new Map<string, { items: ItemRow[]; edges: Row[] }>();
  for (const [k, it] of byKey) {
    const root = find(k);
    if (!comps.has(root)) comps.set(root, { items: [], edges: [] });
    comps.get(root)!.items.push(it);
  }
  for (const r of edges) comps.get(find(key(r.c.a)))!.edges.push(r);

  const groups: Group[] = [...comps.entries()].map(([id, g]) => {
    const allExact = g.edges.every((r) => classify(r) === "exact");
    const maxGapMs = Math.max(...g.edges.map((r) => r.c.deltaMs));
    const kind: GroupKind = allExact ? "exact" : g.edges.some((r) => classify(r) !== "exact" && r.c.deltaMs > BURST_MIN_GAP_MS) ? "burst" : "similar";
    const keep = [...g.items].sort((x, y) => pixels(y) - pixels(x) || (x.uploadTime ?? 0) - (y.uploadTime ?? 0))[0];
    return {
      id,
      kind,
      items: g.items.sort((x, y) => x.account.localeCompare(y.account) || (x.captureTime ?? 0) - (y.captureTime ?? 0)),
      maxDistance: Math.max(0, ...g.edges.map((r) => r.distance ?? 0)),
      maxGapMs,
      keep,
      accounts: [...new Set(g.items.map((i) => i.account))].sort() as Label[],
    };
  });
  const order: Record<GroupKind, number> = { exact: 0, similar: 1, burst: 2 };
  return groups.sort((a, b) => order[a.kind] - order[b.kind] || b.items.length - a.items.length);
}

// Which copy to keep in every group. "largest" is the default suggestion (most pixels, then earliest upload).
export type KeepRule = "largest" | "smallest" | "A" | "B" | "oldest" | "newest";

export const KEEP_RULES: { value: KeepRule; label: string }[] = [
  { value: "largest", label: "Largest photo" },
  { value: "smallest", label: "Smallest photo" },
  { value: "A", label: "Copy in account A" },
  { value: "B", label: "Copy in account B" },
  { value: "oldest", label: "Earliest upload" },
  { value: "newest", label: "Latest upload" },
];

const up = (i: ItemRow) => i.uploadTime ?? 0;

export function keepFor(g: Group, rule: KeepRule): ItemRow {
  const first = (xs: ItemRow[], cmp: (x: ItemRow, y: ItemRow) => number) => [...xs].sort(cmp)[0];
  switch (rule) {
    case "smallest":
      return first(g.items, (x, y) => pixels(x) - pixels(y) || up(x) - up(y));
    case "oldest":
      return first(g.items, (x, y) => up(x) - up(y));
    case "newest":
      return first(g.items, (x, y) => up(y) - up(x));
    case "A":
    case "B": {
      // A group with no copy in that account falls back to the default suggestion.
      const mine = g.items.filter((i) => i.account === rule);
      return mine.length ? first(mine, (x, y) => pixels(y) - pixels(x) || up(x) - up(y)) : g.keep;
    }
    default:
      return g.keep;
  }
}
