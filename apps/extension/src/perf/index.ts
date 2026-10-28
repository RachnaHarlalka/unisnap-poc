// Performance reports for the dashboard: one Markdown file per finished run, downloaded to the
// browser's Downloads folder. Everything stays on this machine; reports hold counts and timings only.
import { formatReportMarkdown, mergeSpans, startRun, summaryLine } from "@unisnap/engine";
import type { Run } from "@unisnap/engine";

const clock = { now: () => performance.now(), wall: () => Date.now() };

export const newRun = (kind: string): Run => startRun(kind, clock, __BUILD_ID__);

// Screen-drawing work (for example grouping on every redraw) happens outside any run. It is collected
// here and added to the next report, then reset.
let ui = newRun("ui");
export const measureUi = <T>(name: string, fn: () => T): T => ui.timeSync(name, fn);

const pad = (n: number) => String(n).padStart(2, "0");

function fileName(kind: string, at: number, build: string): string {
  const d = new Date(at);
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  return `unisnap-${kind}-${stamp}-${build.replace(/[^\w+.-]/g, "_")}.md`;
}

function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "text/markdown" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** End a run: print one summary line, and by default save the report as a file. Never throws. */
export function finishRun(run: Run, opts: { save?: boolean } = {}): void {
  try {
    const rendered = ui.finish();
    ui = newRun("ui");
    const report = mergeSpans(run.finish(), rendered.spans, "ui.");
    console.info(`[Unisnap perf] ${summaryLine(report)}`);
    if (opts.save ?? true) download(fileName(report.kind, report.startedAt, report.build), formatReportMarkdown(report));
  } catch (e) {
    console.warn("[Unisnap perf] could not write the report:", e);
  }
}
