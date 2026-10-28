// View-model types and small helpers the dashboard pages share.
import type { Label } from "@/core/types";
import type { ItemRow } from "@/core/types";
import type { Group, GroupKind, KeepRule } from "@/core/groups";
import { guardTrash } from "@/core/trash";

export type Tone = "good" | "warn" | "bad" | "info" | "";
export type Page = "review" | "libraries" | "trash" | "checks";
export type Scope = "across" | "within";

export const KIND: Record<GroupKind, { name: string; hint: string; tone: Tone }> = {
  exact: { name: "Exact", hint: "Identical file", tone: "good" },
  similar: { name: "Similar", hint: "Same photo, resized or re-saved", tone: "info" },
  alike: { name: "Looks alike", hint: "Weak evidence: probably different photos, check each one", tone: "warn" },
  burst: { name: "Burst", hint: "Different frames taken close together", tone: "warn" },
};

// Where the workflow stands. "Saved" data survives a reload; it is only live after a scan in this session.
export interface Flow {
  scanned: boolean;
  compared: boolean;
  scanDone: boolean;
  compareDone: boolean;
  stale: boolean;
  next: 0 | 1 | 2 | 3;
  lastAt: number;
  pairs: number;
  scoredPairs: number;
}

export interface TrashUi {
  armed: boolean;
  connected: boolean;
  canAct: boolean; // both accounts connected and nothing else running
  items: Record<Label, ItemRow[]>;
  selected: Set<string>;
  rule: KeepRule;
  setRule: (r: KeepRule) => void;
  keepOf: (g: Group) => ItemRow; // the copy the current rule keeps in this group
  toggle: (g: Group, it: ItemRow) => void;
  keepOnly: (g: Group, it: ItemRow) => void; // keep this copy, mark the others for Trash
  selectDuplicates: (gs: Group[]) => void;
}

// Why this photo may not be moved to Trash, or undefined if it may.
export const refusal = (it: ItemRow, items: Record<Label, ItemRow[]>) =>
  guardTrash(it, items[it.account].filter((x) => x.dedupKey === it.dedupKey).length);

export const selectable = (g: Group, items: Record<Label, ItemRow[]>, keep: ItemRow) =>
  g.items.filter((i) => i !== keep && !refusal(i, items));

