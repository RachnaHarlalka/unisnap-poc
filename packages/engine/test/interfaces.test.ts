// Proves the interfaces can be implemented without any platform code, and works as the reference
// for ADDING_A_WRAPPER.md. These fakes run in plain Node.
import { describe, expect, it } from "vitest";
import type { Account, AccountId, DeleteLogEntry, Fingerprint, ItemOutcome, MediaItem, MediaSource, Pixels, Store, StoredMatch } from "../src";

class FakeSource implements MediaSource {
  constructor(private library: Record<AccountId, MediaItem[]>) {}
  async listAccounts(): Promise<Account[]> {
    return Object.keys(this.library).map((id) => ({ id, displayName: id }));
  }
  async *listItems(account: AccountId): AsyncIterable<MediaItem[]> {
    const items = this.library[account] ?? [];
    for (let i = 0; i < items.length; i += 2) yield items.slice(i, i + 2);
  }
  async getThumbnailPixels(_item: MediaItem, size: number): Promise<Pixels> {
    return { width: size, height: size, data: new Uint8Array(size * size * 4) };
  }
  async trash(items: MediaItem[]): Promise<ItemOutcome[]> {
    return items.map((item) => ({ item, status: "done" as const }));
  }
  async restore(items: MediaItem[]): Promise<ItemOutcome[]> {
    return items.map((item) => ({ item, status: "done" as const }));
  }
}

class MemoryStore implements Store {
  private items = new Map<string, MediaItem>();
  private prints = new Map<AccountId, Map<string, Fingerprint>>();
  private matches: StoredMatch[] = [];
  private log: DeleteLogEntry[] = [];
  private k = (i: MediaItem) => `${i.account}:${i.mediaKey}`;
  async saveItems(items: MediaItem[]) {
    for (const i of items) this.items.set(this.k(i), i);
  }
  async loadItems(account: AccountId) {
    return [...this.items.values()].filter((i) => i.account === account);
  }
  async clearAccount(account: AccountId) {
    for (const [k, i] of this.items) if (i.account === account) this.items.delete(k);
  }
  async saveFingerprints(account: AccountId, f: Map<string, Fingerprint>) {
    this.prints.set(account, new Map([...(this.prints.get(account) ?? []), ...f]));
  }
  async loadFingerprints(account: AccountId) {
    return new Map(this.prints.get(account) ?? []);
  }
  async saveMatches(m: StoredMatch[]) {
    this.matches = m;
  }
  async loadMatches() {
    return this.matches;
  }
  async loadDeleteLog() {
    return this.log;
  }
  async appendDeleteLog(e: DeleteLogEntry[]) {
    this.log = [...e, ...this.log];
  }
  async updateDeleteLog(id: string, patch: Partial<DeleteLogEntry>) {
    this.log = this.log.map((e) => (e.id === id ? { ...e, ...patch } : e));
  }
  async removeDeleteLog(id: string) {
    this.log = this.log.filter((e) => e.id !== id);
  }
}

const item = (account: AccountId, mediaKey: string): MediaItem => ({ account, mediaKey });

describe("interfaces", () => {
  it("a source can list any number of accounts, a page at a time", async () => {
    const src: MediaSource = new FakeSource({ phone: [item("phone", "1"), item("phone", "2"), item("phone", "3")], drive: [], gp1: [] });
    expect((await src.listAccounts()).map((a) => a.id)).toEqual(["phone", "drive", "gp1"]);
    const pages: number[] = [];
    for await (const page of src.listItems("phone")) pages.push(page.length);
    expect(pages).toEqual([2, 1]);
  });

  it("a store keeps items per account and replaces them on rescan", async () => {
    const store: Store = new MemoryStore();
    await store.saveItems([item("A", "1"), item("B", "1")]);
    await store.saveFingerprints("A", new Map([["1", "00ff00ff00ff00ff"]]));
    await store.clearAccount("A");
    expect(await store.loadItems("A")).toEqual([]);
    expect(await store.loadItems("B")).toHaveLength(1);
    expect((await store.loadFingerprints("A")).get("1")).toBe("00ff00ff00ff00ff");
  });

  it("a store keeps a delete log that can be updated and pruned", async () => {
    const store: Store = new MemoryStore();
    const e: DeleteLogEntry = { id: "e1", label: "A", email: "a@x", dedupKey: "k", mediaKey: "m", trashedAt: 1, before: { A: 2, B: 3, C: 4 }, stage: "requested" };
    await store.appendDeleteLog([e]);
    await store.updateDeleteLog("e1", { stage: "trashed" });
    expect((await store.loadDeleteLog())[0].stage).toBe("trashed");
    await store.removeDeleteLog("e1");
    expect(await store.loadDeleteLog()).toEqual([]);
  });
});
