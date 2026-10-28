// Baseline for the safety rules. Trash only; these refusals must survive the restructure unchanged.
import { describe, expect, it } from "vitest";
import { cycleOk, entryFailed, guardTrash, MAX_BATCH } from "../trash";
import type { JournalEntry } from "../trash";
import { dims, fmtDuration, isVideo, keyOf } from "../format";
import { item, video } from "./fixtures";

describe("guardTrash", () => {
  it("batch cap is 100", () => expect(MAX_BATCH).toBe(100));
  it("allows an owned, non-favourite item with a unique key", () => expect(guardTrash(item("A", "a"), 1)).toBeUndefined());
  it("refuses an item with no dedupKey", () => expect(guardTrash(item("A", "a", { dedupKey: undefined }), 1)).toBe("this item has no dedupKey"));
  it("refuses favourites", () => expect(guardTrash(item("A", "a", { isFavorite: true }), 1)).toBe("favourites are never touched"));
  it("refuses items the account does not own, but allows unknown ownership", () => {
    expect(guardTrash(item("A", "a", { isOwned: false }), 1)).toBe("this account does not own the item");
    expect(guardTrash(item("A", "a", { isOwned: undefined }), 1)).toBeUndefined();
  });
  it("refuses when several items in the account share the key", () => {
    expect(guardTrash(item("A", "a"), 2)).toBe("2 items in this account share its key, so one call would move all of them");
  });
  it("reports the first failing rule: key, then favourite, then ownership, then shared key", () => {
    expect(guardTrash(item("A", "a", { dedupKey: undefined, isFavorite: true }), 3)).toBe("this item has no dedupKey");
    expect(guardTrash(item("A", "a", { isFavorite: true, isOwned: false }), 3)).toBe("favourites are never touched");
    expect(guardTrash(item("A", "a", { isOwned: false }), 3)).toBe("this account does not own the item");
  });
});

const entry = (o: Partial<JournalEntry> = {}): JournalEntry => ({
  id: "1", label: "A", email: "a@x", dedupKey: "k", mediaKey: "m", trashedAt: 0,
  before: { A: 50, B: 50 }, stage: "restored", inTrashList: true, afterTrash: { A: 49, B: 50 },
  goneFromLibrary: true, afterRestore: { A: 50, B: 50 }, backInLibrary: true, ...o,
});

describe("cycleOk", () => {
  it("a single item passes only if only its own account lost exactly one and everything came back", () => {
    expect(cycleOk(entry())).toBe(true);
    expect(cycleOk(entry({ afterTrash: { A: 49, B: 49 } }))).toBe(false); // other account changed
    expect(cycleOk(entry({ afterTrash: { A: 48, B: 50 } }))).toBe(false); // lost more than one
    expect(cycleOk(entry({ afterRestore: { A: 49, B: 50 } }))).toBe(false); // not fully restored
    expect(cycleOk(entry({ stage: "trashed" }))).toBe(false);
    expect(cycleOk(entry({ goneFromLibrary: false }))).toBe(false);
    expect(cycleOk(entry({ backInLibrary: false }))).toBe(false);
  });
  it("checks the other account for a B entry", () => {
    expect(cycleOk(entry({ label: "B", afterTrash: { A: 50, B: 49 } }))).toBe(true);
    expect(cycleOk(entry({ label: "B", afterTrash: { A: 49, B: 50 } }))).toBe(false);
  });
  it("a batch entry is judged on the item alone, but also needs to be in the Trash list", () => {
    expect(cycleOk(entry({ batchId: "b", afterTrash: undefined, afterRestore: undefined }))).toBe(true);
    expect(cycleOk(entry({ batchId: "b", inTrashList: false }))).toBe(false);
  });
});

describe("entryFailed", () => {
  it("is true for failed, and for a requested entry that carries an error", () => {
    expect(entryFailed(entry({ stage: "failed" }))).toBe(true);
    expect(entryFailed(entry({ stage: "requested", error: "x" }))).toBe(true);
    expect(entryFailed(entry({ stage: "requested" }))).toBe(false);
    expect(entryFailed(entry({ stage: "trashed" }))).toBe(false);
  });
});

describe("format helpers used by the logic", () => {
  it("isVideo is true for any numeric duration, including 0", () => {
    expect(isVideo(video("A", "v", 0))).toBe(true);
    expect(isVideo(item("A", "p"))).toBe(false);
  });
  it("keyOf joins account and mediaKey", () => expect(keyOf(item("B", "xyz"))).toBe("B:xyz"));
  it("dims and fmtDuration", () => {
    expect(dims(item("A", "a"))).toBe("800×600");
    expect(dims(item("A", "a", { width: undefined }))).toBe("size unknown");
    expect(fmtDuration(65_000)).toBe("1:05");
    expect(fmtDuration(undefined)).toBe("");
  });
});
