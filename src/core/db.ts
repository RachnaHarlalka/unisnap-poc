// IndexedDB: the two stores from the spec's data model. Everything stays local.
import type { RawItem } from "@/shared/protocol";
import type { ItemRow, Label } from "./types";

const DB_NAME = "unisnap-poc";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      const items = db.createObjectStore("items", { keyPath: ["account", "mediaKey"] });
      items.createIndex("account", "account");
      items.createIndex("dedupKey", "dedupKey");
      db.createObjectStore("matches", { keyPath: ["itemA", "itemB"] });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const done = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });

export function toRow(account: Label, r: RawItem): ItemRow {
  return {
    account,
    mediaKey: r.mediaKey,
    dedupKey: r.dedupKey,
    captureTime: r.timestamp,
    uploadTime: r.creationTimestamp,
    width: r.resWidth,
    height: r.resHeight,
    thumbUrl: r.thumb,
    isOwned: r.isOwned,
    isFavorite: r.isFavorite,
    isArchived: r.isArchived,
    isLivePhoto: r.isLivePhoto,
  };
}

export async function clearAccount(account: Label): Promise<void> {
  const db = await open();
  const tx = db.transaction("items", "readwrite");
  const store = tx.objectStore("items");
  const keys = store.index("account").openKeyCursor(IDBKeyRange.only(account));
  keys.onsuccess = () => {
    const c = keys.result;
    if (c) {
      store.delete(c.primaryKey);
      c.continue();
    }
  };
  await done(tx);
  db.close();
}

export async function putItems(rows: ItemRow[]): Promise<void> {
  const db = await open();
  const tx = db.transaction("items", "readwrite");
  for (const r of rows) tx.objectStore("items").put(r);
  await done(tx);
  db.close();
}

export async function listAccountItems(account: Label): Promise<ItemRow[]> {
  const db = await open();
  const tx = db.transaction("items");
  const req = tx.objectStore("items").index("account").getAll(IDBKeyRange.only(account));
  const rows = await new Promise<ItemRow[]>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result as ItemRow[]);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return rows.sort((x, y) => (y.captureTime ?? 0) - (x.captureTime ?? 0));
}
