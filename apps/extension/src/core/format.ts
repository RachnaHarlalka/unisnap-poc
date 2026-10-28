import type { ItemRow } from "./types";

const LONG = new Intl.DateTimeFormat(undefined, {
  day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
});
const SHORT = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });

const COMPACT = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
export const fmtCompact = (t?: number) => (t ? COMPACT.format(t) : "no date");
export const fmtDate = (t?: number) => (t ? LONG.format(t) : "no date");
export const fmtShort = (t?: number) => (t ? SHORT.format(t) : "never");
export const dims = (i: ItemRow) => (i.width && i.height ? `${i.width}×${i.height}` : "size unknown");
export const keyOf = (i: ItemRow) => `${i.account}:${i.mediaKey}`;

// GPTK only reports a duration for videos.
export const isVideo = (i: ItemRow) => typeof i.duration === "number";

export const fmtDuration = (ms?: number) => {
  if (ms === undefined) return "";
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
