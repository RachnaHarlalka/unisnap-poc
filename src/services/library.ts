import { sendToTab } from "./tabs";
import { clearAccount, listAccountItems, putItems, toRow } from "@/core/db";
import type { Label } from "@/core/types";
import type { ListPageResult } from "@/shared/protocol";

const PAUSE_MS = 700; // between pages
const MAX_RETRIES = 4; // consecutive failures before giving up
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface Progress {
  pages: number;
  items: number;
  retries: number;
  ms: number; // elapsed time of this scan
  done: boolean;
  error?: string;
}

// Pages one tab at a time: one request in flight, a short pause between pages,
// exponential backoff on errors, stop after repeated failures. Read-only.
export async function listLibrary(label: Label, tabId: number, onProgress: (p: Progress) => void): Promise<Progress> {
  const t0 = Date.now();
  const p: Progress = { pages: 0, items: 0, retries: 0, ms: 0, done: false };
  // A re-list replaces what was stored, but fingerprints already computed are kept (by mediaKey),
  // so a rescan never makes the comparison step redo work it has already done.
  const known = new Map((await listAccountItems(label)).map((r) => [r.mediaKey, r.dhash]));
  await clearAccount(label);
  let pageId: string | null = null;
  let failures = 0;
  let loggedRaw = false;

  while (true) {
    try {
      const page: ListPageResult = await sendToTab<ListPageResult>(tabId, "listPage", { pageId });
      failures = 0;
      if (!loggedRaw && page.items[0]) {
        console.log(`[Unisnap] raw item, account ${label}:`, page.items[0]);
        loggedRaw = true;
      }
      await putItems(page.items.map((r) => ({ ...toRow(label, r), dhash: known.get(r.mediaKey) })));
      p.pages++;
      p.items += page.items.length;
      p.ms = Date.now() - t0;
      onProgress({ ...p });
      if (!page.nextPageId) break;
      pageId = page.nextPageId;
      await sleep(PAUSE_MS);
    } catch (e) {
      failures++;
      p.retries++;
      if (failures > MAX_RETRIES) {
        p.error = `Stopped after ${MAX_RETRIES} failed retries on page ${p.pages + 1}: ${e instanceof Error ? e.message : String(e)}`;
        p.ms = Date.now() - t0;
      onProgress({ ...p });
        return p;
      }
      await sleep(2000 * 2 ** (failures - 1));
    }
  }
  p.done = true;
  p.ms = Date.now() - t0;
      onProgress({ ...p });
  return p;
}
