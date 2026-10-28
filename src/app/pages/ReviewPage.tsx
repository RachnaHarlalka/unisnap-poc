import { useState } from "react";
import { classify } from "@/core/matching";
import type { Row } from "@/core/matching";
import { Thumb } from "@/app/components/Thumb";
import { buildGroups, KEEP_RULES } from "@/core/groups";
import { MAX_BATCH } from "@/core/trash";
import type { Group, GroupKind, KeepRule } from "@/core/groups";
import { Pill } from "@/app/components/ui";
import { KIND, refusal, selectable } from "@/app/viewmodel";
import { dims, fmtCompact, fmtDuration, isVideo, keyOf } from "@/core/format";
import type { Scope, TrashUi } from "@/app/viewmodel";

function GroupCard({ g, t, scope }: { g: Group; t: TrashUi; scope: Scope }) {
  const keepItem = t.keepOf(g);
  const picks = selectable(g, t.items, keepItem);
  const groupHasPick = g.items.some((x) => t.selected.has(keyOf(x)));
  return (
    <article className="group">
      <header className="ghead">
        <Pill tone={KIND[g.kind].tone}>{KIND[g.kind].name}</Pill>
        {g.hasVideo && <Pill tone="">Video</Pill>}
        <span className="gtitle">
          {g.items.length} copies {scope === "within" && <span>· in {g.accounts[0]}</span>}
        </span>
      </header>
      <div className="tiles">
        {g.items.map((it) => {
          const keep = it === keepItem;
          const checked = t.selected.has(keyOf(it));
          const refused = refusal(it, t.items);
          const lastCopy = !checked && g.items.filter((x) => x !== it).every((x) => t.selected.has(keyOf(x)));
          const disabled = !t.canAct || !!refused || lastCopy;
          const state = checked ? "picked" : groupHasPick ? "keeping" : keep ? "keep" : "";
          const tagText = checked ? "Trash" : groupHasPick ? "Keep" : keep ? "Suggested" : "Duplicate";
          const why = refused ? `Not allowed: ${refused}` : lastCopy ? "Keep at least one copy in each group" : !t.canAct ? "Connect both accounts first" : "";
          return (
            <figure
              key={keyOf(it)}
              className={`tile ${state} ${t.armed && !disabled ? "clickable" : ""}`}
              title={t.armed ? why || (checked ? "Click to undo" : "Click to mark this copy for Trash") : undefined}
              onClick={t.armed && !disabled ? () => t.toggle(g, it) : undefined}
            >
              <Thumb base={it.thumbUrl} px={112} />
              <span className="acct">{it.account}</span>
              {t.armed && (
                <label className="pick" onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" checked={checked} disabled={disabled} onChange={() => t.toggle(g, it)} aria-label="Mark for Trash" />
                </label>
              )}
              <span className={`tag ${checked ? "bad" : state === "keep" || state === "keeping" ? "good" : ""}`}>{tagText}</span>
              <figcaption>
                {dims(it)}
                {isVideo(it) && ` · ${fmtDuration(it.duration)}`}
                <br />
                {fmtCompact(it.captureTime)}
              </figcaption>
              {t.armed && refused && <span className="why">Not allowed: {refused}</span>}
              {t.armed && (
                <button
                  className="btn tiny keepbtn"
                  disabled={!t.canAct}
                  onClick={(e) => {
                    e.stopPropagation();
                    t.keepOnly(g, it);
                  }}
                >
                  Keep this one
                </button>
              )}
            </figure>
          );
        })}
      </div>
      <footer className="gfoot">
        <span title={g.kind === "exact" ? "Same Google key" : `${g.maxDistance} of 64 pixels differ, ${g.maxGapMs} ms apart`}>
          {g.kind === "exact" ? "Same file" : `${g.maxDistance}/64 differ · ${g.maxGapMs} ms`}
        </span>
        {t.armed && (
          <button className="btn tiny ghost" disabled={!t.canAct || picks.length === 0} onClick={() => t.selectDuplicates([g])}>
            Mark {picks.length} duplicate{picks.length === 1 ? "" : "s"}
          </button>
        )}
      </footer>
    </article>
  );
}

interface Props {
  rows: Row[] | null;
  t: TrashUi;
  scope: Scope;
  setScope: (s: Scope) => void;
  filter: GroupKind | "all";
  setFilter: (f: GroupKind | "all") => void;
}

const PAGE = 40; // groups drawn at a time, so a thousand photos does not mean a thousand cards

export function ReviewPage({ rows, t, scope, setScope, filter, setFilter }: Props) {
  // How many groups are drawn; going back to the first page whenever the bucket or filter changes.
  const viewKey = `${scope}/${filter}`;
  const [lim, setLim] = useState({ key: viewKey, n: PAGE });
  const limit = lim.key === viewKey ? lim.n : PAGE;
  const groups = buildGroups(rows ?? []);
  const pending = (rows ?? []).filter((r) => classify(r) === undefined).length;
  // Bucket 1: the same photo in both accounts. Bucket 2: extra copies inside a single account.
  const isAcross = (g: Group) => g.accounts.length > 1;
  const nAcross = groups.filter(isAcross).length;
  const nWithin = groups.length - nAcross;
  const inScope = groups.filter((g) => isAcross(g) === (scope === "across"));
  const count = (k: GroupKind) => inScope.filter((g) => g.kind === k).length;
  const shown = inScope.filter((g) => filter === "all" || g.kind === filter);
  // The bulk button only takes strong evidence: Exact and Similar groups. Looks-alike and Burst groups (probably different
  // photos) are marked only when that filter is open on purpose, and groups with a video are never part of it.
  const eligible = shown.filter((g) => !g.hasVideo && (g.kind === "exact" || g.kind === "similar" || filter === g.kind));
  const eligibleCount = eligible.reduce((n, g) => n + selectable(g, t.items, t.keepOf(g)).length, 0);

  if (!rows?.length) {
    return (
      <div className="empty big">
        <b>Nothing to review yet</b>
        <span>Connect your accounts, scan both libraries, then find duplicates. Results show up here.</span>
      </div>
    );
  }
  return (
    <>
      <div className="seg" role="tablist" aria-label="Where the duplicates are">
        <button role="tab" aria-selected={scope === "across"} className={scope === "across" ? "active" : ""} onClick={() => setScope("across")}>
          <span className="seg-top">
            <span className="seg-name">Across both accounts</span>
            <span className="seg-count">{nAcross}</span>
          </span>
          <span className="seg-desc">Same photo in A and B</span>
        </button>
        <button role="tab" aria-selected={scope === "within"} className={scope === "within" ? "active" : ""} onClick={() => setScope("within")}>
          <span className="seg-top">
            <span className="seg-name">Inside one account</span>
            <span className="seg-count">{nWithin}</span>
          </span>
          <span className="seg-desc">Extra copies in A or in B</span>
        </button>
      </div>

      <div className="filters">
        {(["all", "exact", "similar", "alike", "burst"] as const).map((k) => (
          <button key={k} className={`chip ${filter === k ? "active" : ""}`} onClick={() => setFilter(k)}>
            {k === "all" ? "All" : KIND[k].name}
            <span>{k === "all" ? inScope.length : count(k)}</span>
          </button>
        ))}
        {pending > 0 && <span className="filters-note">{pending} pairs not compared yet</span>}
      </div>

      {t.armed && (
        <div className="bulk">
          <div className="bulkrule">
            <span className="bulklabel">Keep</span>
            <span className="select">
              <select value={t.rule} onChange={(e) => t.setRule(e.target.value as KeepRule)} aria-label="Which copy to keep in every group">
                {KEEP_RULES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </span>
            <span className="muted" title="Looks-alike and Burst groups are probably different photos, and groups with a video are never bulk-marked. Open those filters to handle them by hand.">
              in every group{filter !== "alike" && filter !== "burst" && count("alike") + count("burst") > 0 ? " · skips Looks alike and Burst" : ""}
            </span>
          </div>
          <button
            className="btn danger solid"
            disabled={!t.canAct || eligibleCount === 0}
            title={`Up to ${MAX_BATCH} photos are moved per round`}
            onClick={() => t.selectDuplicates(eligible)}
          >
            Mark {Math.min(eligibleCount, MAX_BATCH)} photo{Math.min(eligibleCount, MAX_BATCH) === 1 ? "" : "s"}
            {eligibleCount > MAX_BATCH ? ` of ${eligibleCount}` : ""}
          </button>
        </div>
      )}

      <div className="groups">
        {shown.slice(0, limit).map((g) => (
          <GroupCard key={g.id} g={g} t={t} scope={scope} />
        ))}
      </div>
      {shown.length > limit && (
        <button className="btn more" onClick={() => setLim({ key: viewKey, n: limit + PAGE })}>
          Show {Math.min(PAGE, shown.length - limit)} more ({shown.length - limit} left)
        </button>
      )}
      {shown.length === 0 && (
        <div className="empty">
          {inScope.length === 0
            ? scope === "across"
              ? "No photo is in both accounts yet."
              : "No account has extra copies of its own photos."
            : "Nothing in this filter."}
        </div>
      )}
    </>
  );
}
