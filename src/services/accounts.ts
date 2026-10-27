import type { Label } from "@/core/types";
import { sendToTab } from "./tabs";
import type { FirstPageResult, PingResult } from "@/shared/protocol";

export interface Attached {
  label: Label;
  slot: number; // the /u/N/ slot in the URL
  tabId?: number;
  account?: string;
  ping?: PingResult;
  firstPage?: FirstPageResult;
  error?: string;
}

const SLOT_FOR: Record<Label, number> = { A: 0, B: 1 };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function findOrOpenTab(slot: number): Promise<chrome.tabs.Tab> {
  const prefix = `https://photos.google.com/u/${slot}/`;
  const existing = (await chrome.tabs.query({ url: "https://photos.google.com/*" })).find((t) => t.url?.startsWith(prefix));
  if (existing) return existing;
  return chrome.tabs.create({ url: prefix, active: false });
}

// Content scripts run at document_idle, so a freshly opened tab may not answer
// straight away: retry the ping a few times, one request at a time.
async function pingWithRetry(tabId: number): Promise<PingResult> {
  let lastError = "";
  let reloaded = false;
  for (let i = 0; i < 12; i++) {
    try {
      const r = await sendToTab<PingResult>(tabId, "ping");
      if (r.gptkApiLoaded && r.hasWizData) return r;
      lastError = r.loadError ?? "page not ready";
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      // A tab opened before the extension was (re)loaded has no content scripts: reload it once.
      if (!reloaded && lastError.includes("Receiving end does not exist")) {
        reloaded = true;
        await chrome.tabs.reload(tabId);
        await sleep(3000);
        continue;
      }
    }
    await sleep(1000);
  }
  throw new Error(lastError);
}

export async function attach(label: Label): Promise<Attached> {
  const slot = SLOT_FOR[label];
  const out: Attached = { label, slot };
  try {
    const tab = await findOrOpenTab(slot);
    out.tabId = tab.id;
    const ping = await pingWithRetry(tab.id!);
    out.ping = ping;
    out.account = ping.account;
    if (!ping.account || !ping.account.includes("@")) throw new Error(`Tab did not report an email (got ${JSON.stringify(ping.account)})`);
    if (!ping.path?.startsWith(`/u/${slot}/`)) throw new Error(`Expected slot /u/${slot}/ but page reports path ${ping.path}`);
    out.firstPage = await sendToTab<FirstPageResult>(tab.id!, "listFirstPage");
  } catch (e) {
    out.error = e instanceof Error ? e.message : String(e);
  }
  return out;
}
