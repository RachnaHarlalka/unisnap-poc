// Talking to a Photos tab about Trash: identity check before any write, and read-only Trash listing.
import { sendToTab } from "./tabs";
import type { ListPageArgs, PingResult, TrashListResult } from "@/shared/protocol";

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Refuse unless the tab is signed in as the expected account in the expected slot.
export async function verifyTab(tabId: number, email: string, slot: number): Promise<void> {
  const ping = await sendToTab<PingResult>(tabId, "ping");
  if (!ping.commands?.includes("trashItem") || !ping.commands.includes("restoreItem")) {
    throw new Error(
      "This Google Photos tab is running an older version of the page script. Reload the extension in chrome://extensions, then reload the Photos tab (or click Connect accounts again).",
    );
  }
  if (ping.account !== email) throw new Error(`Tab is signed in as ${ping.account}, expected ${email}`);
  if (!ping.path?.startsWith(`/u/${slot}/`)) throw new Error(`Tab reports ${ping.path}, expected slot /u/${slot}/`);
}

// Read-only: every dedupKey currently in the account's Trash (one pass, paced).
export async function trashKeys(tabId: number): Promise<Set<string>> {
  const keys = new Set<string>();
  let pageId: string | null = null;
  for (let page = 0; page < 20; page++) {
    const res: TrashListResult = await sendToTab<TrashListResult>(tabId, "listTrash", { pageId } satisfies ListPageArgs);
    for (const i of res.items) if (i.dedupKey) keys.add(i.dedupKey);
    if (!res.nextPageId) break;
    pageId = res.nextPageId;
    await pause(500);
  }
  return keys;
}
