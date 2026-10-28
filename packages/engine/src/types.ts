// Data model shared by every wrapper. Pure data: no platform types, no behaviour.

/** Identifies one account or library inside a scan. Opaque to the engine; wrappers choose the values. */
export type AccountId = string;

export interface Account {
  id: AccountId;
  /** What a person recognises it by, for example an email address or a device name. */
  displayName: string;
}

/** A perceptual hash of an image, as lowercase hex (16 chars for the 64-bit dHash). */
export type Fingerprint = string;

export interface MediaItem {
  account: AccountId;
  /** Unique inside its account. */
  mediaKey: string;
  /** Source's own identical-file key. Items sharing it are the same file. */
  dedupKey?: string;
  /** Capture time, ms since epoch. */
  captureTime?: number;
  /** Upload or import time, ms since epoch. */
  uploadTime?: number;
  width?: number;
  height?: number;
  sizeBytes?: number;
  /** Opaque reference the source can turn into pixels (a URL, a file URI, an asset id). */
  thumbUrl?: string;
  /** false when the account does not own the item (for example, it was shared with it). */
  isOwned?: boolean;
  isFavorite?: boolean;
  isArchived?: boolean;
  isLivePhoto?: boolean;
  /** Length in ms. Present only for videos. */
  duration?: number;
  dhash?: Fingerprint;
}

/** How one pair of items relates. */
export type MatchType = "exact" | "near" | "similar" | "different";

/** How a whole group of items relates. */
export type GroupKind = "exact" | "similar" | "alike" | "burst";

/** The rule that picks which copy of a group is kept. */
export type KeepRule = "largest" | "smallest" | "oldest" | "newest" | { account: AccountId };

export interface MatchGroup {
  id: string;
  kind: GroupKind;
  items: MediaItem[];
  maxDistance: number;
  maxGapMs: number;
  /** Suggestion only. */
  keep: MediaItem;
  /** Accounts that hold a copy. One entry means duplicates inside a single account. */
  accounts: AccountId[];
  /** Video groups are never part of a bulk mark. */
  hasVideo: boolean;
}

/** Item counts per account at one moment. */
export type Counts = Record<AccountId, number>;

/** One photo's journey through Trash, kept so it can be verified and restored later. */
export interface DeleteLogEntry {
  id: string;
  /** Set when several photos were moved in one go. */
  batchId?: string;
  /** The account the photo was moved from. Named `label` for compatibility with entries already saved. */
  label: AccountId;
  email: string;
  dedupKey: string;
  mediaKey: string;
  thumbUrl?: string;
  trashedAt: number;
  before: Counts;
  stage: "requested" | "trashed" | "restored" | "failed";
  inTrashList?: boolean;
  afterTrash?: Counts;
  goneFromLibrary?: boolean;
  restoredAt?: number;
  afterRestore?: Counts;
  backInLibrary?: boolean;
  error?: string;
}

/** A scored pair worth remembering. `itemA` and `itemB` are `account:mediaKey`. */
export interface StoredMatch {
  itemA: string;
  itemB: string;
  type: MatchType;
  distance?: number;
}
