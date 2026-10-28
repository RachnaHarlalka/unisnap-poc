# Baseline: real scan before the restructure

Recorded on `main` at commit `7780142` (plus pnpm, which changes no code). Re-run the same steps after each restructure step and compare. Use the same two accounts and do not upload or delete photos between runs.

## How to record

1. `pnpm install && pnpm run build`, load `dist/`, reload any Photos tabs.
2. Dashboard: **Connect accounts**, **Scan libraries**, **Find duplicates** (wait until it says all pairs are compared).
3. Fill in the table. The numbers come from the sidebar, the POC checks page and the Review page group filters.

| Measure | Baseline | After step a | b | c | d | e | f |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Date / commit | | | | | | | |
| Items listed, account A | | | | | | | |
| Items listed, account B | | | | | | | |
| Candidate pairs | | | | | | | |
| Pairs scored | | | | | | | |
| Groups: Exact | | | | | | | |
| Groups: Similar | | | | | | | |
| Groups: Looks alike | | | | | | | |
| Groups: Burst | | | | | | | |
| Items in all groups | | | | | | | |
| Largest group (items / max distance) | | | | | | | |
| Groups containing a video | | | | | | | |
| Suggested keep for the largest group (account + mediaKey) | | | | | | | |

Optional, once, on a test account only: move one copy to Trash and restore it; all five checks on the Trash page should be green.
