import type { Label } from "@/core/types";
import type { useUnisnap } from "@/app/hooks/useUnisnap";
import { Icon } from "./ui";
import { fmtShort } from "@/core/format";
import type { Flow, Page } from "@/app/viewmodel";

type Hook = ReturnType<typeof useUnisnap>;

interface Props {
  u: Hook;
  flow: Flow;
  page: Page;
  setPage: (p: Page) => void;
  counts: { review: number; libraries: number; trash: number };
  onArm: (on: boolean) => void;
}

export function Sidebar({ u, flow, page, setPage, counts, onArm }: Props) {
  const busy = u.busy !== null;
  const steps = [
    {
      n: 1,
      title: "Connect accounts",
      done: u.connected,
      working: u.busy === "connect",
      sub: u.connected ? "Both accounts ready" : "Find the two Photos tabs",
      run: () => void u.connect(),
      disabled: busy,
    },
    {
      n: 2,
      title: "Scan libraries",
      done: flow.scanDone,
      working: u.busy === "scan",
      sub: flow.scanned ? `${flow.scanDone ? "Scanned" : "Saved"} ${fmtShort(flow.lastAt)}` : "Read both libraries",
      run: () => void u.scanLibraries(),
      disabled: busy || !u.connected,
    },
    {
      n: 3,
      title: "Find duplicates",
      done: flow.compareDone,
      working: u.busy === "find",
      sub: flow.pairs ? `${flow.scoredPairs} of ${flow.pairs} pairs compared` : "Compare by appearance",
      run: () => void u.findDuplicates(),
      disabled: busy || !flow.scanned,
    },
  ];
  const nav: { page: Page; label: string; icon: "review" | "libraries" | "trash" | "checks"; count?: number }[] = [
    { page: "review", label: "Review", icon: "review", count: counts.review },
    { page: "libraries", label: "Libraries", icon: "libraries", count: counts.libraries },
    { page: "trash", label: "Trash history", icon: "trash", count: counts.trash },
    { page: "checks", label: "POC checks", icon: "checks" },
  ];

  return (
    <aside className="side">
      <div className="side-brand">
        <span className="logo">U</span>
        <div>
          <b>Unisnap</b>
          <small>Proof of concept</small>
        </div>
      </div>

      <section className="side-sec">
        <h2 className="side-title">Accounts</h2>
        {(["A", "B"] as Label[]).map((l, i) => {
          const a = u.accounts[i];
          const last = u.lastScan[l];
          const live = !!a?.firstPage && !a.error;
          const email = a?.account ?? last?.email;
          return (
            <div key={l} className="acct-row">
              <span className="acct-av">{l}</span>
              <div className="acct-body">
                <div className="acct-email" title={email}>
                  {email ?? "Not connected yet"}
                </div>
                <div className="acct-sub">
                  <span className={`dot ${live ? "on" : ""}`} />
                  {live ? `Connected · /u/${a!.slot}/` : "Not connected"}
                  {last && <> · scanned {fmtShort(last.at)}</>}
                </div>
              </div>
            </div>
          );
        })}
      </section>

      <section className="side-sec">
        <h2 className="side-title">Workflow</h2>
        <ol className="flow">
          {steps.map((s) => (
            <li key={s.n}>
              <button className={`step ${flow.next === s.n ? "next" : ""} ${s.done ? "done" : ""}`} disabled={s.disabled} onClick={s.run}>
                <span className="step-n">{s.working ? <span className="spin" /> : s.done ? <Icon name="check" size={13} /> : s.n}</span>
                <span className="step-body">
                  <span className="step-title">{s.title}</span>
                  <span className="step-sub">{s.working ? (s.n === 2 ? `A ${u.scan.A?.items ?? 0} · B ${u.scan.B?.items ?? 0} photos read` : u.status || s.sub) : s.sub}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      </section>

      <nav className="side-sec">
        <h2 className="side-title">Workspace</h2>
        {nav.map((n) => (
          <button key={n.page} className={`navitem ${page === n.page ? "active" : ""}`} onClick={() => setPage(n.page)}>
            <Icon name={n.icon} />
            <span>{n.label}</span>
            {n.count !== undefined && <span className="navcount">{n.count}</span>}
          </button>
        ))}
      </nav>

      <div className={`safety ${u.armed ? "on" : ""}`}>
        <label className="switch" title="Off by default. Resets whenever this page loads.">
          <input type="checkbox" checked={u.armed} disabled={busy} onChange={(e) => onArm(e.target.checked)} />
          <span className="track" />
          <span>
            <b>Allow moving to Trash</b>
            <small>{u.armed ? "On: photos can be marked and moved" : "Off: nothing can be changed"}</small>
          </span>
        </label>
      </div>
    </aside>
  );
}
