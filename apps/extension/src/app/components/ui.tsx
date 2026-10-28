// Small presentational components shared by the pages.
import type { ReactNode } from "react";
import type { Tone } from "@/app/viewmodel";

export function Pill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`pill ${tone}`}>{children}</span>;
}

type IconName = "review" | "libraries" | "trash" | "checks" | "check";
const PATHS: Record<IconName, ReactNode> = {
  review: (
    <>
      <rect x="3" y="8" width="12" height="13" rx="2" />
      <path d="M9 4h10a2 2 0 0 1 2 2v10" />
    </>
  ),
  libraries: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16" />
      <path d="M9 7V4h6v3" />
      <path d="M6 7l1 13h10l1-13" />
    </>
  ),
  checks: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l3 3 5-6" />
    </>
  ),
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
};
export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}
