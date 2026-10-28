// Step 9 (H5): move chosen copies to Trash one call at a time in the right account, verify, restore.
// Trash only: nothing in this file can empty Trash or delete permanently.
import type { Label } from "./types";
import type { ItemRow } from "./types";

export interface Counts {
  A: number;
  B: number;
}

export interface JournalEntry {
  id: string;
  batchId?: string; // set when several photos were moved in one go
  label: Label;
  email: string;
  dedupKey: string;
  mediaKey: string;
  thumbUrl?: string;
  trashedAt: number;
  before: Counts; // stored counts at the time of the click (from the last scan)
  stage: "requested" | "trashed" | "restored" | "failed";
  inTrashList?: boolean;
  afterTrash?: Counts;
  goneFromLibrary?: boolean;
  restoredAt?: number;
  afterRestore?: Counts;
  backInLibrary?: boolean;
  error?: string;
}

// Photos per Trash round: keeps each round short and easy to review. Larger selections are done in rounds.
export const MAX_BATCH = 100;

const KEY = "unisnap-trash-journal";

// The journal lets a restore happen even after the dashboard is reloaded.
export function loadJournal(): JournalEntry[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as JournalEntry[];
  } catch {
    return [];
  }
}
export function saveJournal(j: JournalEntry[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(j));
  } catch {
    /* storage unavailable: the in-memory journal still works for this session */
  }
}

// Returns a reason to refuse, or undefined when the item may be trashed.
export function guardTrash(it: ItemRow, sameKeyInAccount: number): string | undefined {
  if (!it.dedupKey) return "this item has no dedupKey";
  if (it.isFavorite) return "favourites are never touched";
  if (it.isOwned === false) return "this account does not own the item";
  if (sameKeyInAccount > 1) return `${sameKeyInAccount} items in this account share its key, so one call would move all of them`;
  return undefined;
}

const other = (l: Label): Label => (l === "A" ? "B" : "A");

// A full cycle is verified only if the item left that account's library alone, and came back.
export function cycleOk(e: JournalEntry): boolean {
  // Batch entries share counts with the rest of the batch, so check the item itself.
  if (e.batchId) return e.stage === "restored" && !!e.goneFromLibrary && !!e.backInLibrary && !!e.inTrashList;
  const o = other(e.label);
  return (
    e.stage === "restored" &&
    !!e.goneFromLibrary &&
    !!e.backInLibrary &&
    e.afterTrash?.[o] === e.before[o] &&
    e.afterTrash?.[e.label] === e.before[e.label] - 1 &&
    e.afterRestore?.A === e.before.A &&
    e.afterRestore?.B === e.before.B
  );
}

// A move that never happened (refused or failed before Google was called).
export const entryFailed = (e: JournalEntry): boolean => e.stage === "failed" || (e.stage === "requested" && !!e.error);
