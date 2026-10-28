// Isolated-world content script. Relays dashboard requests (chrome.runtime
// messaging) into the MAIN world (window.postMessage) and back.
import { APP_ID } from "@/shared/protocol";
import type { BridgeMessage, CommandRequest, CommandResponse } from "@/shared/protocol";

const TIMEOUT_MS = 30_000;

chrome.runtime.onMessage.addListener((message: BridgeMessage, _sender, sendResponse) => {
  if (message?.app !== APP_ID) return;

  const id = crypto.randomUUID();
  let timer: number;

  const onMessage = (event: MessageEvent) => {
    if (event.source !== window) return;
    const res = event.data as CommandResponse;
    if (res?.app !== APP_ID || res.dir !== "response" || res.id !== id) return;
    cleanup();
    sendResponse(res);
  };
  const cleanup = () => {
    window.removeEventListener("message", onMessage);
    clearTimeout(timer);
  };

  window.addEventListener("message", onMessage);
  timer = window.setTimeout(() => {
    cleanup();
    sendResponse({ app: APP_ID, dir: "response", id, ok: false, error: "Timed out waiting for the page (MAIN world host not loaded?)" });
  }, TIMEOUT_MS);

  const req: CommandRequest = { app: APP_ID, dir: "request", id, cmd: message.cmd, args: message.args };
  window.postMessage(req, location.origin);
  return true; // async sendResponse
});
