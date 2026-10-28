import { APP_ID } from "@/shared/protocol";
import type { BridgeMessage, Command, CommandResponse } from "@/shared/protocol";

// Send one command to the GPTK host in a specific photos.google.com tab.
export async function sendToTab<T>(tabId: number, cmd: Command, args?: unknown): Promise<T> {
  const msg: BridgeMessage = { app: APP_ID, cmd, args };
  let res: CommandResponse | undefined;
  try {
    res = await chrome.tabs.sendMessage(tabId, msg);
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    throw new Error(`${m} (reload the Google Photos tab so the extension's content scripts are injected)`);
  }
  if (!res) throw new Error("No response from tab");
  if (!res.ok) throw new Error(res.error ?? "Unknown error");
  return res.result as T;
}
