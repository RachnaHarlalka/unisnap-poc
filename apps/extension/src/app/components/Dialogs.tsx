import { useState } from "react";
import type { Label } from "@/core/types";
import type { ItemRow } from "@/core/types";
import { Thumb } from "./Thumb";
import { keyOf } from "@/core/format";

export function SelectionBar({ chosen, canAct, onClear, onTrash }: { chosen: ItemRow[]; canAct: boolean; onClear: () => void; onTrash: () => void }) {
  const nA = chosen.filter((i) => i.account === "A").length;
  return (
    <div className="selbar" role="region" aria-label="Selection">
      <b>{chosen.length} selected</b>
      <span className="muted">
        A {nA} · B {chosen.length - nA}
      </span>
      <span style={{ flex: 1 }} />
      <button className="btn" onClick={onClear}>
        Clear
      </button>
      <button className="btn danger solid" disabled={!canAct} onClick={onTrash}>
        Move {chosen.length} to Trash…
      </button>
    </div>
  );
}

export function ConfirmDialog({ chosen, emails, onCancel, onConfirm }: { chosen: ItemRow[]; emails: Record<Label, string>; onCancel: () => void; onConfirm: () => void }) {
  const n = chosen.length;
  const nA = chosen.filter((i) => i.account === "A").length;
  const nB = n - nA;
  const needTyping = n >= 10;
  const [typed, setTyped] = useState("");
  const ok = !needTyping || typed.trim() === String(n);
  return (
    <div className="overlay" onClick={onCancel}>
      <div className="dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2>{n === 1 ? "Move this photo to Trash?" : `Move ${n} photos to Trash?`}</h2>
        <div className="strip">
          {chosen.slice(0, 14).map((it) => (
            <Thumb key={keyOf(it)} base={it.thumbUrl} px={n === 1 ? 120 : 56} />
          ))}
          {n > 14 && <span className="muted">+{n - 14} more</span>}
        </div>
        <ul className="plain">
          {nA > 0 && (
            <li>
              <b>{nA}</b> from account A <span className="muted">({emails.A})</span>
            </li>
          )}
          {nB > 0 && (
            <li>
              <b>{nB}</b> from account B <span className="muted">({emails.B})</span>
            </li>
          )}
        </ul>
        <p className="muted">
          Only these photos move, each in its own account. At least one copy of every photo stays. Everything goes to Google Photos' Trash and can be
          restored from the Trash history here or from Google Photos. One photo is moved at a time, and the run stops at the first error.
        </p>
        {needTyping && (
          <label className="typed">
            Type <b>{n}</b> to confirm
            <input value={typed} onChange={(e) => setTyped(e.target.value)} inputMode="numeric" autoFocus />
          </label>
        )}
        <div className="dactions">
          <button className="btn" onClick={onCancel} autoFocus={!needTyping}>
            Cancel
          </button>
          <button className="btn danger solid" disabled={!ok} onClick={onConfirm}>
            Move {n === 1 ? "to Trash" : `${n} to Trash`}
          </button>
        </div>
      </div>
    </div>
  );
}
