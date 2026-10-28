import { useState } from "react";
import type { Label } from "@/core/types";
import type { ItemRow } from "@/core/types";
import { buildGroups, keepFor } from "@/core/groups";
import type { Group, GroupKind, KeepRule } from "@/core/groups";
import { ChecksPage } from "@/app/pages/ChecksPage";
import { ConfirmDialog, SelectionBar } from "@/app/components/Dialogs";
import { LibrariesPage } from "@/app/pages/LibrariesPage";
import { ReviewPage } from "@/app/pages/ReviewPage";
import { Sidebar } from "@/app/components/Sidebar";
import { TrashPage } from "@/app/pages/TrashPage";
import { cycleOk, entryFailed, MAX_BATCH } from "@/core/trash";
import { refusal, selectable } from "./viewmodel";
import { dims, fmtShort, keyOf } from "@/core/format";
import type { Flow, Page, Scope, TrashUi } from "./viewmodel";
import { useUnisnap } from "@/app/hooks/useUnisnap";
import { measureUi } from "@/perf";
import { classify } from "@/core/matching";

const TITLES: Record<Page, { title: string; sub: string }> = {
  review: { title: "Review duplicates", sub: "Choose which copies to keep. Nothing is deleted until you confirm." },
  libraries: { title: "Libraries", sub: "Everything read from the two accounts at the last scan." },
  trash: { title: "Trash history", sub: "What this tool moved to Trash, and whether it came back." },
  checks: { title: "POC checks", sub: "Does the idea hold up? The five hypotheses, with numbers." },
};

export function App() {
  const u = useUnisnap();
  const [page, setPage] = useState<Page>("review");
  const [scope, setScope] = useState<Scope>("across");
  const [filter, setFilter] = useState<GroupKind | "all">("all");
  const [confirming, setConfirming] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rule, setRule] = useState<KeepRule>("largest");

  const stored = { A: u.items.A.length, B: u.items.B.length };
  const rows = u.rows ?? [];
  const scored = rows.filter((r) => classify(r) !== undefined);
  const busy = u.busy !== null;

  // Saved data survives a reload, but it is only live after a scan in this session.
  const scanned = stored.A > 0 && stored.B > 0;
  const compared = rows.length > 0 && scored.length === rows.length;
  const scanDone = scanned && u.freshScan;
  const compareDone = compared && u.freshScan;
  const flow: Flow = {
    scanned,
    compared,
    scanDone,
    compareDone,
    stale: scanned && !u.freshScan,
    next: !u.connected ? 1 : !scanDone ? 2 : !compareDone ? 3 : 0,
    lastAt: Math.max(0, ...Object.values(u.lastScan).map((x) => x?.at ?? 0)),
    pairs: rows.length,
    scoredPairs: scored.length,
  };

  const sharedKeys = new Set(
    u.items.A.map((i) => i.dedupKey).filter((k): k is string => !!k && u.items.B.some((j) => j.dedupKey === k)),
  ).size;
  const real = u.journal.filter((e) => !entryFailed(e));

  const groups = measureUi("buildGroups", () => buildGroups(rows));
  const chosen = groups.flatMap((g) => g.items).filter((i) => selected.has(keyOf(i)));

  // Selection: always leave at least one copy of every group unmarked.
  const toggle = (g: Group, it: ItemRow) =>
    setSelected((prev) => {
      const next = new Set(prev);
      const k = keyOf(it);
      if (next.has(k)) next.delete(k);
      else if (g.items.filter((x) => x !== it).every((x) => next.has(keyOf(x)))) return prev; // never every copy
      else next.add(k);
      return next;
    });
  const keepOf = (g: Group) => keepFor(g, rule);
  const keepOnly = (g: Group, it: ItemRow) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(keyOf(it));
      for (const x of g.items) if (x !== it && !refusal(x, u.items)) next.add(keyOf(x));
      return next;
    });
  const selectDuplicates = (gs: Group[]) =>
    setSelected((prev) => {
      const next = new Set(prev);
      // One round moves at most MAX_BATCH photos: mark the first ones, the rest are done in the next round.
      for (const g of gs) {
        const keep = keepFor(g, rule);
        next.delete(keyOf(keep)); // the copy the rule keeps always stays
        for (const it of selectable(g, u.items, keep)) {
          if (next.size >= MAX_BATCH) return next;
          next.add(keyOf(it));
        }
      }
      return next;
    });
  const trashUi: TrashUi = {
    armed: u.armed,
    connected: u.connected,
    canAct: u.connected && !busy,
    items: u.items,
    selected,
    rule,
    setRule,
    keepOf,
    toggle,
    keepOnly,
    selectDuplicates,
  };
  const emails: Record<Label, string> = { A: u.accounts[0]?.account ?? "account A", B: u.accounts[1]?.account ?? "account B" };

  const errors = [
    ...u.accounts.filter((a) => a.error).map((a) => `Account ${a.label}: ${a.error}`),
    ...(["A", "B"] as Label[]).flatMap((l) => (u.scan[l]?.error ? [`Scan ${l}: ${u.scan[l]!.error}`] : [])),
  ];
  const sameAccount = u.accounts.length === 2 && u.accounts[0].account && u.accounts[0].account === u.accounts[1].account;

  // The one primary action in the page header is whatever comes next in the workflow.
  const nextAction =
    flow.next === 1
      ? { label: "Connect accounts", run: () => void u.connect(), disabled: busy }
      : flow.next === 2
        ? { label: "Scan libraries", run: () => void u.scanLibraries(), disabled: busy || !u.connected }
        : flow.next === 3
          ? { label: "Find duplicates", run: () => void u.findDuplicates(), disabled: busy || !scanned }
          : { label: "Rescan libraries", run: () => void u.scanLibraries(), disabled: busy || !u.connected };

  const exportJson = () =>
    JSON.stringify({
      stored,
      sharedKeys,
      pairs: rows.map((r) => ({
        kind: classify(r),
        distance: r.distance,
        deltaMs: r.c.deltaMs,
        sameKey: r.c.sameDedupKey,
        aspectDiffPct: +(r.c.aspectDiff * 100).toFixed(2),
        capture: r.c.a.captureTime ? new Date(r.c.a.captureTime).toISOString() : null,
        dimsA: dims(r.c.a),
        dimsB: dims(r.c.b),
      })),
      groups: groups.map((g) => ({ kind: g.kind, size: g.items.length, accounts: g.accounts, maxDistance: g.maxDistance, maxGapMs: g.maxGapMs })),
      trash: u.journal.map((e) => ({
        label: e.label,
        batch: !!e.batchId,
        stage: e.stage,
        before: e.before,
        afterTrash: e.afterTrash,
        afterRestore: e.afterRestore,
        inTrashList: e.inTrashList,
        cycleOk: cycleOk(e),
        error: e.error,
      })),
    });

  const head = TITLES[page];
  return (
    <div className="shell">
      <Sidebar
        u={u}
        flow={flow}
        page={page}
        setPage={setPage}
        counts={{ review: groups.length, libraries: stored.A + stored.B, trash: u.journal.length }}
        onArm={(on) => {
          u.setArmed(on);
          if (!on) setSelected(new Set());
        }}
      />

      <main className="main">
        <header className="pagehead">
          <div>
            <h1>{head.title}</h1>
            <p>{head.sub}</p>
          </div>
          <div className="headactions">
            <button className={`btn ${flow.next > 0 ? "primary" : ""}`} disabled={nextAction.disabled} onClick={nextAction.run}>
              {flow.next > 0 ? `Next: ${nextAction.label}` : nextAction.label}
            </button>
          </div>
        </header>

        <div className="notices">
          {errors.length > 0 && <div className="banner">{errors.join("\n")}</div>}
          {u.trashError && <div className="banner">{u.trashError}</div>}
          {sameAccount && <div className="banner">Both slots report the same account. Sign in to the second test account in this Chrome profile.</div>}
          {flow.stale && !busy && (
            <div className="banner info">
              Showing saved results from your last scan{flow.lastAt ? ` (${fmtShort(flow.lastAt)})` : ""}. Your photos may have changed since.{" "}
              {u.connected ? "Scan libraries to refresh." : "Connect accounts, then scan libraries to refresh."}
            </div>
          )}
        </div>

        <div className="content">
          {page === "review" && <ReviewPage rows={u.rows} t={trashUi} scope={scope} setScope={setScope} filter={filter} setFilter={setFilter} />}
          {page === "libraries" && <LibrariesPage items={u.items} accounts={u.accounts} />}
          {page === "trash" && <TrashPage journal={u.journal} busy={busy} connected={u.connected} onRestore={u.restoreMany} onDismiss={u.dismissEntry} />}
          {page === "checks" && (
            <ChecksPage
              flow={flow}
              s={{
                connected: u.connected,
                stored,
                sharedKeys,
                armed: u.armed,
                trashVerified: real.some(cycleOk),
                trashRestoreNeeded: real.some((e) => e.stage === "trashed"),
                trashTests: real.length,
              }}
              accounts={u.accounts}
              scan={u.scan}
              exportJson={exportJson}
            />
          )}
        </div>
      </main>

      {u.armed && chosen.length > 0 && (
        <SelectionBar chosen={chosen} canAct={u.connected && !busy} onClear={() => setSelected(new Set())} onTrash={() => setConfirming(true)} />
      )}
      {confirming && (
        <ConfirmDialog
          chosen={chosen}
          emails={emails}
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            const picked = chosen;
            setConfirming(false);
            setSelected(new Set());
            setPage("trash");
            void u.trashMany(picked, groups);
          }}
        />
      )}
    </div>
  );
}
