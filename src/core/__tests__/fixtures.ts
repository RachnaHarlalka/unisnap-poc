import type { Candidate } from "../candidates";
import type { Row } from "../matching";
import type { ItemRow, Label } from "../types";

// A 4:3 photo captured at t. Override anything per test.
export const item = (account: Label, mediaKey: string, o: Partial<ItemRow> = {}): ItemRow => ({
  account,
  mediaKey,
  dedupKey: `key-${mediaKey}`,
  captureTime: 1_000_000,
  uploadTime: 5_000,
  width: 800,
  height: 600,
  isOwned: true,
  isFavorite: false,
  ...o,
});

export const video = (account: Label, mediaKey: string, duration: number, o: Partial<ItemRow> = {}) =>
  item(account, mediaKey, { duration, ...o });

// A scored pair, built by hand so grouping tests do not depend on findCandidates.
export const row = (a: ItemRow, b: ItemRow, distance: number | undefined, o: Partial<Candidate> = {}): Row => ({
  c: {
    a,
    b,
    deltaMs: 0,
    aspectDiff: 0,
    sameDedupKey: !!a.dedupKey && a.dedupKey === b.dedupKey,
    timeTrusted: true,
    ...o,
  },
  distance,
});
