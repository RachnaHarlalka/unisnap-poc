import { timed } from "@unisnap/engine";
import type { Recorder } from "@unisnap/engine";
import { putItems } from "./db";
import { thumbSrc } from "./thumbnail";
import type { ItemRow } from "./types";

export const MATCH_MAX_DISTANCE = 6; // spec: match at Hamming distance 6 or less
export const SIMILAR_MAX_DISTANCE = 12; // POC guess: above a match but still "looks alike"; tune with real results
export const FP_PX = 256;

export function hamming(a: string, b: string): number {
  let x = BigInt("0x" + a) ^ BigInt("0x" + b);
  let n = 0;
  while (x) {
    n += Number(x & 1n);
    x >>= 1n;
  }
  return n;
}

let worker: Worker | undefined;
let nextId = 1;
const pending = new Map<number, { resolve: (h: string) => void; reject: (e: Error) => void }>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("./dhash.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<{ id: number; hash?: string; error?: string }>) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      if (e.data.hash) p.resolve(e.data.hash);
      else p.reject(new Error(e.data.error ?? "worker error"));
    };
  }
  return worker;
}

const hashBlob = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ id, blob });
  });

// Fetch the ~256px thumbnail with the extension's host permission, hash it in the worker, cache in IndexedDB.
export async function fingerprint(item: ItemRow, run?: Recorder): Promise<string> {
  if (item.dhash) return item.dhash;
  if (!item.thumbUrl) throw new Error("item has no thumbnail URL");
  const url = item.thumbUrl;
  const res = await timed(run, "fetch-thumbnail", () => fetch(thumbSrc(url, FP_PX), { credentials: "include" }));
  if (!res.ok) throw new Error(`thumbnail HTTP ${res.status}`);
  const blob = await timed(run, "read-body", () => res.blob());
  const hash = await timed(run, "hash", () => hashBlob(blob));
  item.dhash = hash;
  await timed(run, "db-write", () => putItems([item]));
  return hash;
}
