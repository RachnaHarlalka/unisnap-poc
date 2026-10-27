import type { Candidate } from "./candidates";
import { findCandidates } from "./candidates";
import { hamming, MATCH_MAX_DISTANCE, SIMILAR_MAX_DISTANCE } from "./fingerprint";
import type { ItemRow, Label } from "./types";

export type MatchType = "exact" | "near" | "similar" | "different";

export interface Row {
  c: Candidate;
  hashA?: string;
  hashB?: string;
  distance?: number;
  error?: string;
}

export const classify = (r: Row): MatchType | undefined => {
  if (r.c.sameDedupKey) return "exact";
  if (r.distance === undefined) return undefined;
  if (r.distance <= MATCH_MAX_DISTANCE) return "near";
  return r.distance <= SIMILAR_MAX_DISTANCE ? "similar" : "different";
};

export const rowsFromStored = (items: Record<Label, ItemRow[]>): Row[] =>
  findCandidates(items.A, items.B).map((c) => ({
    c,
    hashA: c.a.dhash,
    hashB: c.b.dhash,
    distance: c.a.dhash && c.b.dhash ? hamming(c.a.dhash, c.b.dhash) : undefined,
  }));
