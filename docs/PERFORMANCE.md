# Performance reports

After every scan, every Find duplicates run and every trash or restore batch, the dashboard saves one Markdown report to the browser's Downloads folder, named `unisnap-<run>-<date>-<time>-<build>.md`. Move the files into `docs/perf/` to keep them with the project. Connecting accounts only prints one line to the console.

Reports contain counts and timings only: no photo names, keys, or addresses (e-mail addresses in error text are replaced with `<email>`). Nothing is sent anywhere. The first time, Chrome may ask to allow the dashboard to download multiple files; allow it.

## What is in a report

- **Build**: the git commit the extension was built from, with `+dirty` if there were uncommitted changes. Compare reports of the same data across builds to see whether a change helped.
- **Notes**: library sizes and the outcome of the run.
- **Counters**: totals and the rate per second over the whole run (for example `photos-hashed` per second).
- **Timings**: for each step, how many times it ran and the total, mean, median (p50), 95th percentile and maximum time. Spans can overlap (both accounts are read in parallel), so totals can exceed the run time.
- **Raw data**: the same numbers as JSON at the bottom.

## Spans and counters

| Run | Span or counter | Meaning |
| --- | --- | --- |
| scan | `A.page-request`, `B.page-request` | One page of the library from Google Photos |
| scan | `db-write`, `load-known`, `clear-account` | Local database work |
| scan | `pause`, `retry-wait` | Time the app chose to wait (between pages, after errors), not work |
| scan, find | `load-items`, `build-candidates` | Reading saved items; building the candidate pairs from metadata |
| find | `fetch-thumbnail`, `read-body`, `hash`, `db-write` | The four parts of fingerprinting one photo |
| find | `pause` | The fixed wait after each photo |
| find | `photos-hashed` / `hash-reused` | Photos fingerprinted now / sides of a pair whose fingerprint was already saved |
| find | `pairs`, `pairs-already-scored`, `pairs-with-distance` | Candidate pairs, those needing no download, those with a final distance |
| find | `ui-setRows` | Handing results to the screen |
| any | `ui.buildGroups` | Grouping, which runs on every redraw. Collected since the previous report |
| trash, restore | `verify-tab`, `trash-call` / `restore-call` | The account check and each Google call |
| trash, restore | `settle-wait`, `trash-list`, `verify.*` | The wait before checking, reading Trash, and re-reading the libraries |

## Comparing before and after a change

Use the same two accounts and do not add or remove photos in between. Compare the rate counters (photos per second, items per second) and the `p50`/`p95` of the step you changed. A faster step that moves the slowdown elsewhere shows up as a different step with a larger total.
