// Data model shared by the core logic, the services and the app.

// The two accounts being compared. Slot /u/0/ is A, /u/1/ is B.
export type Label = "A" | "B";

export interface ItemRow {
  account: Label;
  mediaKey: string;
  dedupKey?: string;
  captureTime?: number;
  uploadTime?: number;
  width?: number;
  height?: number;
  sizeBytes?: number;
  thumbUrl?: string;
  isOwned?: boolean;
  isFavorite?: boolean;
  isArchived?: boolean;
  isLivePhoto?: boolean;
  dhash?: string;
}

export interface MatchRow {
  itemA: string;
  itemB: string;
  type: "dedupKey" | "fingerprint" | "similar";
  distance?: number;
}
