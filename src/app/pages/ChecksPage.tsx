import { useState } from "react";
import type { Label } from "@/core/types";
import type { Attached } from "@/services/accounts";
import { Pill } from "@/app/components/ui";
import type { Flow, Tone } from "@/app/viewmodel";
import type { Progress } from "@/services/library";

function Check(props: { id: string; title: string; chip: [string, Tone]; big: string; sub: string }) {
  return (
    <div className="card">
      <div className="top">
        <span className="title">
          {props.id} · {props.title}
        </span>
        <Pill tone={props.chip[1]}>{props.chip[0]}</Pill>
      </div>
      <div className="big">{props.big}</div>
      <div className="sub">{props.sub}</div>
    </div>
  );
}

export interface CheckStats {
  connected: boolean;
  stored: { A: number; B: number };
  sharedKeys: number;
  armed: boolean;
  trashVerified: boolean;
  trashRestoreNeeded: boolean;
  trashTests: number;
}

interface Props {
  flow: Flow;
  s: CheckStats;
  accounts: Attached[];
  scan: Partial<Record<Label, Progress>>;
  exportJson: () => string;
}

export function ChecksPage({ flow, s, accounts, scan, exportJson }: Props) {
  const [copied, setCopied] = useState("");
  const { stale, scanned, compared, scoredPairs, pairs } = flow;
  return (
    <>
      <p className="lead">The five questions this proof of concept set out to answer, with the current numbers.</p>
      <div className="cards">
        <Check id="H1" title="Two accounts" chip={s.connected ? ["Pass", "good"] : ["Not run", ""]} big={s.connected ? "2 connected" : "—"} sub="Both tabs answered together" />
        <Check
          id="H2"
          title="Library listing"
          chip={scanned ? (stale ? ["Saved", ""] : ["Verify", "info"]) : ["Not run", ""]}
          big={`A ${s.stored.A} · B ${s.stored.B}`}
          sub={stale ? "Saved from the last scan, not live" : "Check against Google Photos (±1%)"}
        />
        <Check
          id="H3"
          title="Exact keys"
          chip={scanned ? (stale ? ["Saved", ""] : [s.sharedKeys > 0 ? "Found" : "None", s.sharedKeys > 0 ? "good" : "warn"]) : ["Not run", ""]}
          big={`${s.sharedKeys} shared`}
          sub="Same Google key in both accounts"
        />
        <Check
          id="H4"
          title="Fingerprints"
          chip={compared ? (stale ? ["Saved", ""] : ["Done", "good"]) : scoredPairs ? ["Partial", "warn"] : ["Not run", ""]}
          big={`${scoredPairs} / ${pairs} pairs`}
          sub="Pairs of similar photos, compared by pixels. Not a photo count."
        />
        <Check
          id="H5"
          title="Trash and restore"
          chip={s.trashVerified ? ["Pass", "good"] : s.trashRestoreNeeded ? ["Restore it", "warn"] : s.armed ? ["Armed", "bad"] : ["Off", ""]}
          big={s.trashVerified ? "Verified" : s.trashTests ? `${s.trashTests} test(s)` : "Not tested"}
          sub="Trash chosen copies, then restore"
        />
      </div>

      <section className="panel">
        <div className="exportrow">
          <button
            className="btn"
            onClick={() => {
              const json = exportJson();
              navigator.clipboard.writeText(json).then(
                () => setCopied(`Copied ${json.length} characters`),
                () => setCopied("Clipboard blocked: select the text instead"),
              );
            }}
          >
            Copy results as JSON
          </button>
          <span className="muted">{copied || "Numbers only: counts, distances, time gaps. No photo content or URLs."}</span>
        </div>
        <div className="details">
          {(["A", "B"] as Label[]).map((l, i) => {
            const p = scan[l];
            return (
              <section key={l}>
                <h3>Account {l}</h3>
                <p className="muted">
                  {p ? `Last scan: ${p.items} photos in ${p.pages} page(s), ${p.retries} retries, ${(p.ms / 1000).toFixed(1)} s${p.done ? ", complete" : ""}` : "No scan this session."}
                </p>
                <p className="muted">First raw item from Google Photos (field names as GPTK returns them):</p>
                <pre>{accounts[i]?.firstPage ? JSON.stringify(accounts[i].firstPage!.firstItem, null, 2) : "Connect first."}</pre>
              </section>
            );
          })}
        </div>
      </section>
    </>
  );
}
