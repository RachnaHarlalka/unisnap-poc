// Runs in the page's MAIN world (manifest content script, world: "MAIN").
// Bundles only GPTK's Api class from the vendor submodule; `unsafeWindow` is
// aliased to `window` at build time (see vite.content.config.ts).
import { APP_ID } from "@/shared/protocol";
import type { CommandRequest, CommandResponse, FirstPageResult, ListPageArgs, ListPageResult, PingResult, TrashArgs, TrashListResult } from "@/shared/protocol";

type GptkApi = {
  getItemsByUploadedDate(pageId?: string | null): Promise<{ items?: unknown[]; nextPageId?: string | null }>;
  // Only these two write calls are ever reachable. GPTK has no call here that empties Trash or deletes
  // permanently, and none may be added.
  moveItemsToTrash(dedupKeys: string[]): Promise<unknown>;
  restoreFromTrash(dedupKeys: string[]): Promise<unknown>;
  getTrashItems(pageId?: string | null): Promise<{ items?: { mediaKey: string; dedupKey?: string }[]; nextPageId?: string | null }>;
};

let api: GptkApi | null = null;
let loadError: string | undefined;

// GPTK reads WIZ_global_data when its module loads, so load it defensively:
// a page without that global must still answer "ping" with a useful error.
async function loadGptk(): Promise<void> {
  try {
    const mod = await import("../../../../vendor/gptk/src/api/api");
    api = new mod.default() as unknown as GptkApi;
    (window as unknown as { __unisnapApi?: GptkApi }).__unisnapApi = api;
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e);
  }
}
const ready = loadGptk();

function wiz(): Record<string, unknown> | undefined {
  return (window as unknown as { WIZ_global_data?: Record<string, unknown> }).WIZ_global_data;
}

// Safety checks for the two write commands: a single key, and the signed-in account must be the expected one.
function checkedKey(args: unknown): string {
  const a = args as TrashArgs | undefined;
  if (!a || typeof a.dedupKey !== "string" || !a.dedupKey) throw new Error("Refusing: exactly one dedupKey is required");
  const actual = wiz()?.oPEP7c;
  if (typeof a.expectAccount !== "string" || !a.expectAccount || actual !== a.expectAccount) {
    throw new Error(`Refusing: this tab is signed in as ${String(actual)}, not ${String(a.expectAccount)}`);
  }
  return a.dedupKey;
}

const handlers: Record<string, (args: unknown) => Promise<unknown>> = {
  async ping(): Promise<PingResult> {
    await ready;
    const w = wiz();
    return {
      gptkApiLoaded: api !== null,
      loadError,
      hasWizData: !!w,
      account: w?.oPEP7c as string | undefined,
      path: w?.eptZe as string | undefined,
      href: location.href,
      commands: Object.keys(handlers),
    };
  },
  // Read-only: one page of the library, no paging loop (full listing is step 4).
  async listFirstPage(): Promise<FirstPageResult> {
    await ready;
    if (!api) throw new Error(`GPTK API not loaded: ${loadError ?? "unknown"}`);
    const page = await api.getItemsByUploadedDate(null);
    return { itemCount: page.items?.length ?? 0, hasNextPage: !!page.nextPageId, firstItem: page.items?.[0] };
  },
  async trashItem(args: unknown): Promise<{ dedupKey: string }> {
    await ready;
    if (!api) throw new Error(`GPTK API not loaded: ${loadError ?? "unknown"}`);
    const dedupKey = checkedKey(args);
    await api.moveItemsToTrash([dedupKey]); // Trash only: recoverable, one item
    return { dedupKey };
  },
  async restoreItem(args: unknown): Promise<{ dedupKey: string }> {
    await ready;
    if (!api) throw new Error(`GPTK API not loaded: ${loadError ?? "unknown"}`);
    const dedupKey = checkedKey(args);
    await api.restoreFromTrash([dedupKey]);
    return { dedupKey };
  },
  // Read-only: one page of what is currently in Trash.
  async listTrash(args: unknown): Promise<TrashListResult> {
    await ready;
    if (!api) throw new Error(`GPTK API not loaded: ${loadError ?? "unknown"}`);
    const pageId = (args as ListPageArgs | undefined)?.pageId ?? null;
    const page = await api.getTrashItems(pageId);
    return { items: (page.items ?? []).map((i) => ({ mediaKey: i.mediaKey, dedupKey: i.dedupKey })), nextPageId: page.nextPageId ?? null };
  },
  // Read-only: one page by upload date. The dashboard drives the paging loop and the pacing.
  async listPage(args: unknown): Promise<ListPageResult> {
    await ready;
    if (!api) throw new Error(`GPTK API not loaded: ${loadError ?? "unknown"}`);
    const pageId = (args as ListPageArgs | undefined)?.pageId ?? null;
    if (pageId !== null && typeof pageId !== "string") throw new Error("pageId must be a string or null");
    const page = await api.getItemsByUploadedDate(pageId);
    return { items: (page.items ?? []) as ListPageResult["items"], nextPageId: page.nextPageId ?? null };
  },
};

window.addEventListener("message", async (event) => {
  if (event.source !== window) return;
  const msg = event.data as CommandRequest;
  if (msg?.app !== APP_ID || msg.dir !== "request") return;

  const reply = (r: Partial<CommandResponse>) =>
    window.postMessage({ app: APP_ID, dir: "response", id: msg.id, ...r } as CommandResponse, location.origin);

  const handler = Object.prototype.hasOwnProperty.call(handlers, msg.cmd) ? handlers[msg.cmd] : undefined;
  if (!handler) return reply({ ok: false, error: `Unknown command: ${String(msg.cmd)}` });
  try {
    reply({ ok: true, result: await handler(msg.args) });
  } catch (e) {
    reply({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});
