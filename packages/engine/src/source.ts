import type { Account, AccountId, MediaItem } from "./types";

/** Decoded image pixels, 4 bytes per pixel (R, G, B, A), row by row. */
export interface Pixels {
  width: number;
  height: number;
  data: Uint8Array | Uint8ClampedArray;
}

/** What happened to one item in a trash or restore call. */
export interface ItemOutcome {
  item: MediaItem;
  /** "skipped" means it was not attempted because an earlier item failed. */
  status: "done" | "failed" | "skipped";
  error?: string;
}

/**
 * Where photos come from and where they can be moved to Trash: one implementation per platform
 * (Google Photos in a browser, a phone gallery, Google Drive).
 *
 * Contract every implementation must keep:
 * - trash() moves to Trash only. It never empties Trash and never deletes permanently.
 * - Before every trash() or restore() call the implementation re-checks that the target really is the
 *   account the item belongs to, and refuses if not.
 * - trash() and restore() stop at the first failure and report the rest as "skipped".
 * - Nothing here changes anything except trash() and restore().
 */
export interface MediaSource {
  listAccounts(): Promise<Account[]>;

  /** Pages of one account's library. Read-only. The implementation does its own pacing and retries. */
  listItems(account: AccountId): AsyncIterable<MediaItem[]>;

  /** A small decoded rendition of the item, at most `size` pixels on the longest side. */
  getThumbnailPixels(item: MediaItem, size: number): Promise<Pixels>;

  trash(items: MediaItem[]): Promise<ItemOutcome[]>;

  restore(items: MediaItem[]): Promise<ItemOutcome[]>;
}
