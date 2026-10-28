import { isVideo } from "./format";
import type { ItemRow } from "./types";

export const MAX_TIME_DELTA_MS = 2000;
export const MAX_ASPECT_DIFF = 0.02; // relative, 2%
export const MAX_DURATION_DIFF_MS = 1000; // two videos are only paired if their lengths are this close
// A capture time shared by this many photos in one account is a batch-import time, not a moment in time.
export const SHARED_TIME_LIMIT = 3;

export interface Candidate {
  a: ItemRow;
  b: ItemRow;
  deltaMs: number;
  aspectDiff: number; // relative difference of width/height
  sameDedupKey: boolean;
  timeTrusted: boolean; // false when either photo's capture time is shared by many photos in its account
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
  // Photos with no real capture time (screenshots, chat photos, imports) often all get the same stamp.
  const sameTime = new Map<string, number>();
  for (const i of [...as, ...bs]) sameTime.set(`${i.account}|${i.captureTime}`, (sameTime.get(`${i.account}|${i.captureTime}`) ?? 0) + 1);
  const trusted = (i: ItemRow) => (sameTime.get(`${i.account}|${i.captureTime}`) ?? 0) < SHARED_TIME_LIMIT;
  const consider = (a: ItemRow, b: ItemRow) => {
    // A video is never paired with a photo, and two videos must be about the same length.
    if (isVideo(a) !== isVideo(b)) return;
    if (isVideo(a) && Math.abs((a.duration ?? 0) - (b.duration ?? 0)) > MAX_DURATION_DIFF_MS) return;
    const deltaMs = Math.abs(a.captureTime! - b.captureTime!);
    if (deltaMs > MAX_TIME_DELTA_MS) return;
    const ra = aspect(a)!;
    const rb = aspect(b)!;
    const aspectDiff = Math.abs(ra - rb) / Math.max(ra, rb);
    if (aspectDiff > MAX_ASPECT_DIFF) return;
    out.push({ a, b, deltaMs, aspectDiff, sameDedupKey: !!a.dedupKey && a.dedupKey === b.dedupKey, timeTrusted: trusted(a) && trusted(b) });
  };
  for (const a of as) for (const b of bs) consider(a, b);
  for (const xs of [as, bs]) for (let i = 0; i < xs.length; i++) for (let j = i + 1; j < xs.length; j++) consider(xs[i], xs[j]);
  return out.sort((x, y) => x.deltaMs - y.deltaMs);
}
