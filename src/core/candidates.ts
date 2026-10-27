import type { ItemRow } from "./types";

export const MAX_TIME_DELTA_MS = 2000;
export const MAX_ASPECT_DIFF = 0.02; // relative, 2%

export interface Candidate {
  a: ItemRow;
  b: ItemRow;
  deltaMs: number;
  aspectDiff: number; // relative difference of width/height
  sameDedupKey: boolean;
}

const aspect = (i: ItemRow) => (i.width && i.height ? i.width / i.height : undefined);

// Metadata-only shortlist: capture time within 2 s and aspect ratio within 2%.
// Pairs photos across the two accounts and also within each account (same-account duplicates).
// Items the account does not own, or without a capture time or size, can't be paired.
export function findCandidates(aItems: ItemRow[], bItems: ItemRow[]): Candidate[] {
  const usable = (i: ItemRow) => i.isOwned !== false && i.captureTime !== undefined && aspect(i) !== undefined;
  const as = aItems.filter(usable);
  const bs = bItems.filter(usable);
  const out: Candidate[] = [];
  const consider = (a: ItemRow, b: ItemRow) => {
    const deltaMs = Math.abs(a.captureTime! - b.captureTime!);
    if (deltaMs > MAX_TIME_DELTA_MS) return;
    const ra = aspect(a)!;
    const rb = aspect(b)!;
    const aspectDiff = Math.abs(ra - rb) / Math.max(ra, rb);
    if (aspectDiff > MAX_ASPECT_DIFF) return;
    out.push({ a, b, deltaMs, aspectDiff, sameDedupKey: !!a.dedupKey && a.dedupKey === b.dedupKey });
  };
  for (const a of as) for (const b of bs) consider(a, b);
  for (const xs of [as, bs]) for (let i = 0; i < xs.length; i++) for (let j = i + 1; j < xs.length; j++) consider(xs[i], xs[j]);
  return out.sort((x, y) => x.deltaMs - y.deltaMs);
}
