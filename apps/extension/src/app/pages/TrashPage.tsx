import type { ReactNode } from "react";
import { Thumb } from "@/app/components/Thumb";
import { cycleOk, entryFailed } from "@/core/trash";
import type { JournalEntry } from "@/core/trash";
import { Pill } from "@/app/components/ui";
import { fmtDate } from "@/core/format";

function Step({ ok, children }: { ok?: boolean; children: ReactNode }) {
  return (
    <li className={ok === undefined ? "pending" : ok ? "ok" : "bad"}>
      <span className="mark">{ok === undefined ? "○" : ok ? "✓" : "✗"}</span>
      {children}
    </li>
  );
}

const counts = (c?: { A: number; B: number }) => (c ? `A ${c.A} · B ${c.B}` : "…");

interface ActionProps {
  busy: boolean;
  connected: boolean;
  onRestore: (es: JournalEntry[]) => void;
  onDismiss: (id: string) => void;
}

function SingleEntry({ e, busy, connected, onRestore, onDismiss }: ActionProps & { e: JournalEntry }) {
  const o = e.label === "A" ? "B" : "A";
  if (entryFailed(e)) {
    return (
      <div className="entry">
        <Thumb base={e.thumbUrl} px={88} />
        <div className="body">
          <div className="gtitle">
            Account {e.label} <span>· {e.email} · {fmtDate(e.trashedAt)}</span>
          </div>
          <p className="entrynote">
            <b>Not moved.</b> The request was refused or failed before it reached Google Photos, so nothing changed.
          </p>
          {e.error && <div className="banner">{e.error}</div>}
        </div>
        <div className="side-actions">
          <button className="btn" onClick={() => onDismiss(e.id)}>
            Dismiss
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="entry">
      <Thumb base={e.thumbUrl} px={88} />
      <div className="body">
        <div className="gtitle">
          Account {e.label} <span>· {e.email} · {fmtDate(e.trashedAt)}</span>
        </div>
        <ul className="checks">
          <Step ok={e.stage !== "requested" && e.stage !== "failed" ? true : e.error ? false : undefined}>Moved to Trash</Step>
          <Step ok={e.inTrashList}>Listed in this account's Trash</Step>
          <Step ok={e.goneFromLibrary}>
            Gone from account {e.label}'s library ({counts(e.before)} → {counts(e.afterTrash)})
          </Step>
          <Step ok={e.afterTrash ? e.afterTrash[o] === e.before[o] : undefined}>
            Account {o} unchanged ({e.before[o]} → {e.afterTrash ? e.afterTrash[o] : "…"})
          </Step>
          <Step ok={e.stage === "restored" ? !!e.backInLibrary && e.afterRestore?.A === e.before.A && e.afterRestore?.B === e.before.B : undefined}>
            Restored and back in the library ({counts(e.afterRestore)})
          </Step>
        </ul>
        {e.error && <div className="banner">{e.error}</div>}
      </div>
      <div className="side-actions">
        {cycleOk(e) && <Pill tone="good">Cycle verified</Pill>}
        {e.stage !== "restored" && e.stage !== "requested" && (
          <button className="btn" disabled={busy || !connected} onClick={() => onRestore([e])}>
            Restore
          </button>
        )}
      </div>
    </div>
  );
}

function BatchEntry({ es, busy, connected, onRestore, onDismiss }: ActionProps & { es: JournalEntry[] }) {
  const failed = es.filter(entryFailed);
  const live = es.filter((e) => !entryFailed(e));
  const nA = live.filter((e) => e.label === "A").length;
  const inTrash = live.filter((e) => e.inTrashList).length;
  const gone = live.filter((e) => e.goneFromLibrary).length;
  const restored = live.filter((e) => e.stage === "restored").length;
  const restorable = live.filter((e) => e.stage === "trashed");
  const after = live.find((e) => e.afterTrash)?.afterTrash;
  const afterRestore = live.find((e) => e.afterRestore)?.afterRestore;
  const verified = live.length > 0 && live.every(cycleOk);
  const firstError = es.find((e) => e.error)?.error;
  return (
    <div className="entry">
      <div className="body">
        <div className="gtitle">
          Batch of {es.length} <span>· {nA} from A · {live.length - nA} from B · {fmtDate(es[0].trashedAt)}</span>
        </div>
        <div className="strip">
          {es.slice(0, 14).map((e) => (
            <Thumb key={e.id} base={e.thumbUrl} px={48} />
          ))}
          {es.length > 14 && <span className="muted">+{es.length - 14} more</span>}
        </div>
        <ul className="checks">
          <Step ok={failed.length ? false : live.length === es.length ? true : undefined}>
            Moved to Trash: {live.length} of {es.length}
          </Step>
          <Step ok={live.length ? inTrash === live.length : undefined}>
            Listed in Trash: {inTrash} of {live.length}
          </Step>
          <Step ok={live.length ? gone === live.length : undefined}>
            Gone from the libraries: {gone} of {live.length} ({counts(es[0].before)} → {counts(after)})
          </Step>
          <Step ok={restored ? restored === live.length && live.every((e) => e.backInLibrary) : undefined}>
            Restored and back: {restored} of {live.length}
            {restored ? ` (${counts(afterRestore)})` : ""}
          </Step>
        </ul>
        {firstError && <div className="banner">{firstError}</div>}
      </div>
      <div className="side-actions">
        {verified && <Pill tone="good">Batch verified</Pill>}
        {restorable.length > 0 && (
          <button className="btn" disabled={busy || !connected} onClick={() => onRestore(restorable)}>
            Restore all ({restorable.length})
          </button>
        )}
        {failed.length > 0 && (
          <button className="btn" onClick={() => failed.forEach((e) => onDismiss(e.id))}>
            Dismiss {failed.length} not moved
          </button>
        )}
      </div>
    </div>
  );
}

export function TrashPage({ journal, busy, connected, onRestore, onDismiss }: { journal: JournalEntry[] } & ActionProps) {
  // Newest first; entries from one multi-select round are shown together.
  const units: JournalEntry[][] = [];
  const byBatch = new Map<string, JournalEntry[]>();
  for (const e of journal) {
    if (!e.batchId) units.push([e]);
    else if (byBatch.has(e.batchId)) byBatch.get(e.batchId)!.push(e);
    else {
      const u = [e];
      byBatch.set(e.batchId, u);
      units.push(u);
    }
  }
  return (
    <div className="panel">
      <p className="lead">
        Every photo this tool moves to Trash is listed here, so it can be restored even after a reload. The tool only moves photos to Trash and
        restores them. It never empties Trash and never deletes anything permanently.
      </p>
      {journal.length === 0 && <div className="empty">Nothing moved to Trash yet. Switch on “Allow moving to Trash”, mark some photos and use the bar at the bottom.</div>}
      <div className="journal">
        {units.map((u) =>
          u[0].batchId ? (
            <BatchEntry key={u[0].batchId} es={u} busy={busy} connected={connected} onRestore={onRestore} onDismiss={onDismiss} />
          ) : (
            <SingleEntry key={u[0].id} e={u[0]} busy={busy} connected={connected} onRestore={onRestore} onDismiss={onDismiss} />
          ),
        )}
      </div>
    </div>
  );
}
