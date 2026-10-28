import type { AccountId, DeleteLogEntry, Fingerprint, MediaItem, StoredMatch } from "./types";

/**
 * Local persistence: one implementation per platform (IndexedDB in the extension, SQLite on a phone).
 * Everything stays on the device.
 */
export interface Store {
  /** Insert or replace, keyed by account and mediaKey. */
  saveItems(items: MediaItem[]): Promise<void>;
  loadItems(account: AccountId): Promise<MediaItem[]>;
  /** Remove every item of an account (a rescan replaces them). */
  clearAccount(account: AccountId): Promise<void>;

  /** mediaKey -> fingerprint, so a rescan never recomputes work it already did. */
  saveFingerprints(account: AccountId, fingerprints: Map<string, Fingerprint>): Promise<void>;
  loadFingerprints(account: AccountId): Promise<Map<string, Fingerprint>>;

  saveMatches(matches: StoredMatch[]): Promise<void>;
  loadMatches(): Promise<StoredMatch[]>;

  /** The delete log: every photo moved to Trash, so it can be verified and restored after a restart. */
  loadDeleteLog(): Promise<DeleteLogEntry[]>;
  appendDeleteLog(entries: DeleteLogEntry[]): Promise<void>;
  updateDeleteLog(id: string, patch: Partial<DeleteLogEntry>): Promise<void>;
  removeDeleteLog(id: string): Promise<void>;
}
