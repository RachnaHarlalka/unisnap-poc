import { useCallback, useEffect, useRef, useState } from "react";
import { attach } from "@/services/accounts";
import type { Label } from "@/core/types";
import type { Attached } from "@/services/accounts";
import { sendToTab } from "@/services/tabs";
import { listAccountItems } from "@/core/db";
import type { ItemRow } from "@/core/types";
import { fingerprint, hamming } from "@/core/fingerprint";
import { rowsFromStored } from "@/core/matching";
import type { Row } from "@/core/matching";
import { listLibrary } from "@/services/library";
import type { Progress } from "@/services/library";
import { guardTrash, loadJournal, MAX_BATCH, saveJournal } from "@/core/trash";
import { trashKeys, verifyTab } from "@/services/trash";
import type { JournalEntry } from "@/core/trash";
import type { Group } from "@/core/groups";
import type { TrashArgs } from "@/shared/protocol";
import { timed } from "@unisnap/engine";
import type { Recorder } from "@unisnap/engine";
import { finishRun, newRun } from "@/perf";

export type Busy = null | "connect" | "scan" | "find" | "trash";
type Items = Record<Label, ItemRow[]>;
export type LastScan = Partial<Record<Label, { at: number; email?: string }>>;
const LAST_KEY = "unisnap-last-scan";
const loadLast = (): LastScan => {
  try {
    return JSON.parse(localStorage.getItem(LAST_KEY) ?? "{}") as LastScan;
  } catch {
    return {};
  }
};
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function useUnisnap() {
  const [accounts, setAccounts] = useState<Attached[]>([]);
  const [busy, setBusy] = useState<Busy>(null);
  const [scan, setScan] = useState<Partial<Record<Label, Progress>>>({});
  const [items, setItems] = useState<Items>({ A: [], B: [] });
  const [rows, setRows] = useState<Row[] | null>(null);
  const [status, setStatus] = useState("");
  // Dangerous actions start OFF on every page load and are never persisted.
  const [armed, setArmed] = useState(false);
  const [journal, setJournal] = useState<JournalEntry[]>(loadJournal);
  const [trashError, setTrashError] = useState("");
  // The saved items survive a reload, but the connection does not. Remember when each account was last
  // read (and as whom) so the page can say its numbers are saved, not live.
  const [lastScan, setLastScan] = useState<LastScan>(loadLast);
  const [freshScan, setFreshScan] = useState(false);

  const refresh = useCallback(async () => {
    const next = { A: await listAccountItems("A"), B: await listAccountItems("B") };
    setItems(next);
    return next;
  }, []);

  // Show what is already stored when the page opens.
  useEffect(() => {
    void refresh().then((n) => {
      const r = rowsFromStored(n);
      if (r.length) setRows(r);
    });
  }, [refresh]);

  const ready = accounts.filter((a) => a.tabId !== undefined && a.firstPage);
  const connected = ready.length === 2 && accounts[0].account !== accounts[1].account;

  // Finding or opening the two Photos tabs and asking each who is signed in is read-only and cheap, so it
  // also runs by itself when the page opens if the accounts were connected before. Every trash or restore
  // still re-checks the tab's signed-in email first.
  async function connect(auto = false) {
    setBusy("connect");
    setStatus(auto ? "Reconnecting to your accounts…" : "Opening tabs for /u/0/ and /u/1/ and asking each who is signed in…");
    const run = newRun("connect");
    run.note("auto", auto);
    setAccounts(await Promise.all((["A", "B"] as Label[]).map((l) => run.scope(l).time("attach", () => attach(l)))));
    finishRun(run, { save: false });
    setStatus("");
    setBusy(null);
  }

  const autoTried = useRef(false);
  useEffect(() => {
    if (autoTried.current) return;
    autoTried.current = true;
    if (Object.keys(loadLast()).length > 0) void connect(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function scanLibraries() {
    setBusy("scan");
    setScan({});
    setStatus("Reading both libraries one page at a time…");
    const run = newRun("scan");
    await relist(run);
    finishRun(run);
    setStatus("");
    setBusy(null);
  }

  async function findDuplicates() {
    setBusy("find");
    const run = newRun("find-duplicates");
    const n = await run.time("load-items", refresh);
    const scored = run.timeSync("build-candidates", () => rowsFromStored(n));
    for (const l of ["A", "B"] as Label[]) run.note(`items.${l}`, n[l].length);
    run.count("pairs", scored.length);
    setRows([...scored]);
    // Pairs whose two fingerprints are already saved need no network at all: score them now, skip them below.
    const todo: Row[] = [];
    for (const r of scored) {
      if (r.hashA && r.hashB) r.distance = hamming(r.hashA, r.hashB);
      else todo.push(r);
    }
    run.count("pairs-already-scored", scored.length - todo.length);
    setRows([...scored]);
    // One thumbnail request at a time, a short pause only after a real request.
    for (let i = 0; i < todo.length; i++) {
      const r = todo[i];
      setStatus(`Comparing photos… ${i + 1} of ${todo.length} new${scored.length > todo.length ? ` (${scored.length - todo.length} already done)` : ""}`);
      try {
        if (!r.c.a.dhash) {
          r.hashA = await fingerprint(r.c.a, run);
          run.count("photos-hashed");
          await run.time("pause", () => pause(200));
        } else {
          r.hashA = r.c.a.dhash;
          run.count("hash-reused");
        }
        if (!r.c.b.dhash) {
          r.hashB = await fingerprint(r.c.b, run);
          run.count("photos-hashed");
          await run.time("pause", () => pause(200));
        } else {
          r.hashB = r.c.b.dhash;
          run.count("hash-reused");
        }
        r.distance = hamming(r.hashA, r.hashB);
        r.error = undefined;
      } catch (e) {
        r.error = e instanceof Error ? e.message : String(e);
        run.count("errors");
      }
      // Redrawing thousands of rows after every comparison is wasteful: update every 10th, and at the end.
      if (i % 10 === 9 || i === todo.length - 1) run.timeSync("ui-setRows", () => setRows([...scored]));
    }
    run.count("pairs-with-distance", scored.filter((r) => r.distance !== undefined).length);
    finishRun(run);
    setStatus("");
    setBusy(null);
  }

  const patchEntry = (id: string, patch: Partial<JournalEntry>) =>
    setJournal((prev) => {
      const next = prev.map((e) => (e.id === id ? { ...e, ...patch } : e));
      saveJournal(next);
      return next;
    });

  // Re-read both libraries (one request at a time per tab) and refresh everything derived from them.
  async function relist(run?: Recorder): Promise<Items> {
    const results = await Promise.all(
      ready.map(async (a) => ({ a, p: await listLibrary(a.label, a.tabId!, (p) => setScan((o) => ({ ...o, [a.label]: p })), run?.scope(a.label)) })),
    );
    const n = await timed(run, "load-items", refresh);
    const pairs = await timed(run, "build-candidates", () => rowsFromStored(n));
    for (const l of ["A", "B"] as Label[]) run?.note(`items.${l}`, n[l].length);
    run?.count("pairs", pairs.length);
    setRows(pairs);
    const okAccounts = results.filter((r) => r.p.done);
    if (okAccounts.length) {
      const next: LastScan = { ...lastScan };
      for (const { a } of okAccounts) next[a.label] = { at: Date.now(), email: a.account };
      setLastScan(next);
      try {
        localStorage.setItem(LAST_KEY, JSON.stringify(next));
      } catch {
        /* storage unavailable: the banner just won't remember across reloads */
      }
    }
    if (okAccounts.length === results.length && results.length === 2) setFreshScan(true);
    return n;
  }

  // Move the chosen photos to Trash, one call at a time, each sent only to its own account's tab.
  // The safeguards are the same as for a single photo; a batch just repeats them per item and stops at the first error.
  async function trashMany(chosen: ItemRow[], groups: Group[]) {
    setBusy("trash");
    setTrashError("");
    const run = newRun("trash");
    let outcome = "completed";
    const entries: JournalEntry[] = [];
    const moved = new Set<string>();
    const accts = new Map<Label, Attached>();
    try {
      if (!armed) throw new Error("Dangerous actions are switched off.");
      if (!connected) throw new Error("Connect both accounts first.");
      const unique = [...new Map(chosen.map((i) => [`${i.account}:${i.mediaKey}`, i])).values()];
      if (unique.length === 0) throw new Error("Nothing selected.");
      if (unique.length > MAX_BATCH) throw new Error(`Select at most ${MAX_BATCH} photos per round.`);

      // Never move every copy of a photo: each group must keep at least one.
      const picked = new Set(unique.map((i) => `${i.account}:${i.mediaKey}`));
      if (groups.some((g) => g.items.every((i) => picked.has(`${i.account}:${i.mediaKey}`)))) {
        throw new Error("Refused: that would move every copy in a group to Trash. Keep at least one copy in each group.");
      }
      for (const it of unique) {
        const why = guardTrash(it, items[it.account].filter((x) => x.dedupKey === it.dedupKey).length);
        if (why) throw new Error(`Refused (account ${it.account}): ${why}.`);
      }
      // Each involved account's tab must be signed in as the account the photos belong to.
      for (const l of new Set(unique.map((i) => i.account))) {
        const a = accounts.find((x) => x.label === l);
        if (!a?.tabId || !a.account) throw new Error(`Account ${l} is not connected.`);
        setStatus(`Checking that account ${l}'s tab is signed in as ${a.account}…`);
        await run.time("verify-tab", () => verifyTab(a.tabId!, a.account!, a.slot));
        accts.set(l, a);
      }

      run.count("requested", unique.length);
      const batchId = unique.length > 1 ? crypto.randomUUID() : undefined;
      const before = { A: items.A.length, B: items.B.length };
      const now = Date.now();
      for (const it of unique) {
        entries.push({
          id: crypto.randomUUID(), batchId, label: it.account, email: accts.get(it.account)!.account!,
          dedupKey: it.dedupKey!, mediaKey: it.mediaKey, thumbUrl: it.thumbUrl, trashedAt: now, before, stage: "requested",
        });
      }
      setJournal((prev) => {
        const next = [...entries, ...prev];
        saveJournal(next);
        return next;
      });

      for (let i = 0; i < unique.length; i++) {
        const e = entries[i];
        const a = accts.get(e.label)!;
        setStatus(`Moving ${i + 1} of ${unique.length} to Trash…`);
        try {
          await run.time("trash-call", () => sendToTab(a.tabId!, "trashItem", { dedupKey: e.dedupKey, expectAccount: a.account! } satisfies TrashArgs));
          run.count("moved");
          moved.add(e.id);
          patchEntry(e.id, { stage: "trashed" });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          run.count("failed");
          patchEntry(e.id, { error: msg, stage: "failed" });
          for (const rest of entries.slice(i + 1)) patchEntry(rest.id, { error: "Not attempted: the batch stopped after an error.", stage: "failed" });
          outcome = `stopped after ${moved.size} of ${unique.length}: ${msg}`;
          setTrashError(`Stopped after ${moved.size} of ${unique.length}: ${msg}`);
          break;
        }
        await run.time("pause", () => pause(500));
      }

      const movedEntries = entries.filter((e) => moved.has(e.id));
      if (movedEntries.length) {
        await run.time("settle-wait", () => pause(2500));
        setStatus("Checking Trash…");
        const inTrash = new Map<Label, Set<string>>();
        for (const l of new Set(movedEntries.map((e) => e.label))) inTrash.set(l, await run.time("trash-list", () => trashKeys(accts.get(l)!.tabId!)));
        setStatus("Re-reading both libraries to verify…");
        const n = await relist(run.scope("verify"));
        const afterTrash = { A: n.A.length, B: n.B.length };
        for (const e of movedEntries) {
          patchEntry(e.id, {
            inTrashList: inTrash.get(e.label)!.has(e.dedupKey),
            afterTrash,
            goneFromLibrary: !n[e.label].some((x) => x.mediaKey === e.mediaKey),
          });
        }
      }
    } catch (e) {
      outcome = `refused or failed: ${e instanceof Error ? e.message : String(e)}`;
      setTrashError(e instanceof Error ? e.message : String(e));
    } finally {
      run.note("outcome", outcome);
      finishRun(run);
      setStatus("");
      setBusy(null);
    }
  }

  const dismissEntry = (id: string) =>
    setJournal((prev) => {
      const next = prev.filter((e) => e.id !== id);
      saveJournal(next);
      return next;
    });

  async function restoreMany(chosen: JournalEntry[]) {
    setBusy("trash");
    setTrashError("");
    const run = newRun("restore");
    let outcome = "completed";
    try {
      if (!connected) throw new Error("Connect both accounts first.");
      const accts = new Map<Label, Attached>();
      for (const l of new Set(chosen.map((e) => e.label))) {
        const a = accounts.find((x) => x.label === l);
        if (!a?.tabId || !a.account) throw new Error(`Account ${l} is not connected.`);
        const email = chosen.find((e) => e.label === l)!.email;
        if (a.account !== email) throw new Error(`Slot /u/${a.slot}/ is now ${a.account}, but these photos were trashed from ${email}.`);
        setStatus(`Checking that account ${l}'s tab is signed in as ${a.account}…`);
        await run.time("verify-tab", () => verifyTab(a.tabId!, a.account!, a.slot));
        accts.set(l, a);
      }
      run.count("requested", chosen.length);
      const restored: JournalEntry[] = [];
      for (let i = 0; i < chosen.length; i++) {
        const e = chosen[i];
        const a = accts.get(e.label)!;
        setStatus(`Restoring ${i + 1} of ${chosen.length}…`);
        try {
          await run.time("restore-call", () => sendToTab(a.tabId!, "restoreItem", { dedupKey: e.dedupKey, expectAccount: a.account! } satisfies TrashArgs));
          run.count("restored");
          restored.push(e);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          run.count("failed");
          outcome = `stopped after ${restored.length} of ${chosen.length}: ${msg}`;
          patchEntry(e.id, { error: msg });
          setTrashError(`Stopped after ${restored.length} of ${chosen.length}: ${msg}`);
          break;
        }
        await run.time("pause", () => pause(500));
      }
      if (restored.length) {
        await run.time("settle-wait", () => pause(2500));
        setStatus("Re-reading both libraries to verify…");
        const n = await relist(run.scope("verify"));
        const afterRestore = { A: n.A.length, B: n.B.length };
        for (const e of restored) {
          patchEntry(e.id, {
            stage: "restored",
            restoredAt: Date.now(),
            afterRestore,
            backInLibrary: n[e.label].some((x) => x.mediaKey === e.mediaKey || x.dedupKey === e.dedupKey),
            error: undefined,
          });
        }
      }
    } catch (e) {
      outcome = `refused or failed: ${e instanceof Error ? e.message : String(e)}`;
      setTrashError(e instanceof Error ? e.message : String(e));
    } finally {
      run.note("outcome", outcome);
      finishRun(run);
      setStatus("");
      setBusy(null);
    }
  }

  return {
    accounts, busy, scan, items, rows, status, ready, connected, lastScan, freshScan, connect, scanLibraries, findDuplicates,
    armed, setArmed, journal, trashError, trashMany, restoreMany, dismissEntry,
  };
}
