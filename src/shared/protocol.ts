// Message protocol shared by the dashboard, the isolated-world bridge and the
// MAIN-world GPTK host. All traffic stays inside the browser.
export const APP_ID = "unisnap-poc";

// Commands the MAIN-world host will run. Anything else is refused.
// Steps 2-3: "ping" and the read-only "listFirstPage"; later steps extend this list.
// Step 9 adds trashItem / restoreItem (one item each) and a read-only listTrash.
// Nothing here may empty Trash or delete permanently.
export type Command = "ping" | "listFirstPage" | "listPage" | "trashItem" | "restoreItem" | "listTrash";

export interface CommandRequest {
  app: typeof APP_ID;
  dir: "request";
  id: string;
  cmd: Command;
  args?: unknown;
}

export interface CommandResponse {
  app: typeof APP_ID;
  dir: "response";
  id: string;
  ok: boolean;
  result?: unknown;
  error?: string;
}

// Dashboard -> bridge (chrome.tabs.sendMessage) envelope.
export interface BridgeMessage {
  app: typeof APP_ID;
  cmd: Command;
  args?: unknown;
}

export interface PingResult {
  gptkApiLoaded: boolean;
  loadError?: string;
  hasWizData: boolean;
  account?: string; // WIZ_global_data.oPEP7c, as GPTK reads it
  path?: string; // WIZ_global_data.eptZe, e.g. "/u/1/"
  href: string;
  commands?: string[]; // what the page script in this tab can run (older builds lack the newer ones)
}

export interface FirstPageResult {
  itemCount: number;
  hasNextPage: boolean;
  firstItem?: unknown; // parsed GPTK item, for eyeballing field names
}

// One page of the library, listed by upload date (read-only). pageId null = first page.
export interface ListPageArgs {
  pageId: string | null;
}

// Item as GPTK parses it (field names confirmed from a real item in step 3).
export interface RawItem {
  mediaKey: string;
  timestamp?: number; // capture time, ms
  timezoneOffset?: number;
  creationTimestamp?: number; // upload time, ms
  dedupKey?: string;
  thumb?: string;
  resWidth?: number;
  resHeight?: number;
  isPartialUpload?: boolean;
  isArchived?: boolean;
  isFavorite?: boolean;
  isLivePhoto?: boolean;
  isOwned?: boolean;
  duration?: number; // ms, present only for videos
  geoLocation?: unknown;
}

export interface ListPageResult {
  items: RawItem[];
  nextPageId: string | null;
}

// Step 9: exactly one item per call, and the tab must be signed in as expectAccount.
export interface TrashArgs {
  dedupKey: string;
  expectAccount: string; // email the dashboard believes this tab is signed in as
}

export interface TrashListResult {
  items: { mediaKey: string; dedupKey?: string }[];
  nextPageId: string | null;
}
