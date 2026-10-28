# Architecture audit

Audit only. No source file was changed. This document is the only file added.

Scope: every file under `src/`, `config/`, `public/`, `dashboard.html`, `scripts/`, plus `package.json`, `tsconfig.json`, `.gitmodules`. `vendor/gptk` was inspected only for how it is imported. `docs/` was read for the safety rules and thresholds.

## Decisions taken (after review)

- **pnpm** workspaces (not npm). Lockfile converted with `pnpm import`; `package-lock.json` removed because `pnpm-lock.yaml` replaces it.
- **Vitest 2.x** added. Vitest 5 needs Vite 6+; the repo is on Vite 5 and Vite is not being upgraded.
- **No hard-coded accounts.** This overrides D7 below. The engine works on any number of accounts (`AccountId = string`). It is done as its own commit *after* the logic has moved, and the 63 baseline tests must pass unchanged on two accounts, plus new tests for 3+ accounts. See step c.8 in section 6.
- The extension itself keeps its two-account UI (no UI changes). It uses the ids `"A"` and `"B"`, so stored data stays compatible.

## 0. Things to decide before any work starts

These are the points where I would otherwise be guessing. Each has a recommendation.

| # | Issue | Recommendation |
| --- | --- | --- |
| D1 | **Package manager is npm** (`package-lock.json`), not pnpm. | Use **npm workspaces** (`"workspaces": ["apps/*", "packages/*"]`). Your rule says to keep the existing manager. |
| D2 | **Uncommitted work on `main`**: 10 modified files (shared-timestamp trust, video handling, `docs/FINDINGS.md`, README). This is the behaviour the baseline must capture. | Commit it on `main` first (you do this, or tell me to), then branch `restructure-engine` from that commit. If the work stays uncommitted, it would be mixed into the restructure commits. |
| D3 | **No test runner exists.** README says "No automated tests". Vitest is a new devDependency. | Approve adding `vitest` (root devDependency only). |
| D4 | **The fingerprint is not pure pixels today.** `dhash.worker.ts` does (1) decode the image, (2) resize to 9x8 with the browser's high-quality canvas smoothing, (3) greyscale and compare neighbours to build 64 bits. Only step 3 is pure. Step 2 is browser-specific, and different resamplers give different hashes. | Engine exports `dhashFromGrid(rgba, 9, 8)`, which is step 3 only. The platform does decode and resize. This keeps today's hashes byte-identical. Implementing the resize in the engine would change hashes, which breaks "no behaviour changes" and invalidates hashes already stored in IndexedDB. The cost: your brief says fingerprinting takes `(width, height, Uint8 pixels)`. I can give the engine function that signature, but it must be given the 9x8 grid, or a resize inside the engine changes results. See D5. |
| D5 | **Cross-platform hash compatibility.** A phone app that resizes with a different resampler will produce slightly different hashes from the extension's. The 6-bit threshold was tuned against canvas resizing only. | Out of scope for the restructure. Record it in `ARCHITECTURE.md` as a known limit. The restructure will not try to solve it. |
| D6 | **`MediaSource.getThumbnailPixels(item, size)`** vs. today's flow: fetch a 256px square crop, then resize to 9x8 (non-square, which distorts the aspect ratio on purpose). | The adapter returns the decoded thumbnail pixels (256x256). The app's worker does the 9x8 resize and calls the engine. If you want the 9x8 resize inside the adapter instead, say so. |
| D7 | **(Superseded, see Decisions taken: the engine will support N accounts.)** **Accounts are hard-coded "A" and "B".** `Label = "A" \| "B"` appears in types, `KeepRule` (`"A"`, `"B"`), `findCandidates(aItems, bItems)`, `SLOT_FOR`, the journal, and the UI. `MediaSource.listAccounts()` implies N accounts. | Keep `Label = "A" \| "B"` in the engine for the whole restructure. Generalising it would be a behaviour and API change. Mention it in `ARCHITECTURE.md` as the first thing a phone wrapper will hit. |
| D8 | **Naming.** Your brief lists `MediaItem`, `Fingerprint`, `MatchGroup`, `MatchType`, `KeepRule`. The code has `ItemRow`, a bare `dhash?: string` field, `Group`, and **two** enums: `MatchType` (`exact\|near\|similar\|different`, per pair) and `GroupKind` (`exact\|similar\|alike\|burst`, per group). | Rename on move: `ItemRow` to `MediaItem`, `Group` to `MatchGroup`, `Fingerprint = string` (16 hex chars). Keep both enums; `MatchType` stays the per-pair one and `GroupKind` stays the per-group one. Renames go in their own commit, mechanical only. |
| D9 | **Safety logic lives inside the React hook.** "Every group keeps one copy", the 100-item cap, the guard loop, and "stop at first error" are in `useUnisnap.trashMany`, mixed with React state and Chrome calls. | Extract only the pure checks (`assertKeepsOneCopy`, `assertBatchSize`, and the existing `guardTrash`) into the engine. Leave the orchestration (verify tab, call, journal) in the app. Each extraction gets a test. |
| D10 | **`matches` IndexedDB store is created but never used** (FINDINGS says so). Groups are computed on the fly. | The `Store` interface will include matches because you asked for it, but there is no current behaviour to preserve. I would define it and leave it unwired. Confirm. |
| D11 | `test.py` at the repo root is an **empty file** (0 bytes). | Leave it. I will not delete it unless you say so. |

## 1. Current structure

Single package, Vite + React 18 + TypeScript, built to `dist/`. Three bundles:

| Bundle | Entry | Built by | Runs in |
| --- | --- | --- | --- |
| Dashboard | `dashboard.html` -> `src/app/main.tsx` | `config/vite.config.ts` | extension tab |
| Service worker | `src/background/index.ts` | `config/vite.config.ts` | service worker |
| `main-world.js` | `src/content/main-world.ts` (bundles `vendor/gptk/src/api/api` with `unsafeWindow` defined as `window`) | `config/vite.content.config.ts` (IIFE) | Google Photos page, MAIN world |
| `bridge.js` | `src/content/bridge.ts` | `config/vite.content.config.ts` (IIFE) | Google Photos page, isolated world |

Import rule today (README): `app -> services -> core`, `shared` used by all. In practice `core` is not clean (see section 3).

## 2. Module-by-module classification

Legend: **E** = engine, **A** = adapter-google-photos, **X** = apps/extension, **split** = must be cut in two.

### `src/core/`

| File | Lines | Layer | Notes |
| --- | --- | --- | --- |
| `types.ts` | 29 | **E** | `ItemRow` -> `MediaItem`, `Label`. `MatchRow` is unused by anything (the `matches` store is unused, D10). |
| `candidates.ts` | 48 | **E** | Pure. Constants: `MAX_TIME_DELTA_MS` 2000, `MAX_ASPECT_DIFF` 0.02, `MAX_DURATION_DIFF_MS` 1000, `SHARED_TIME_LIMIT` 3. Imports `isVideo` from `format.ts`. |
| `matching.ts` | 29 | **E** | Pure (`classify`, `Row`, `rowsFromStored`). Imports constants and `hamming` from `fingerprint.ts`, which drags in `db.ts`. Must be unhooked from that file (see below). |
| `groups.ts` | 116 | **E** | Pure: union-find grouping, `GroupKind`, `BURST_MIN_GAP_MS` 50, `KeepRule`, `KEEP_RULES` (labels are UI text), `keepFor`. `KEEP_RULES` label strings arguably belong in the app; moving them is a tiny split. |
| `fingerprint.ts` | 54 | **split** | Pure: `hamming`, `MATCH_MAX_DISTANCE` 6, `SIMILAR_MAX_DISTANCE` 12 -> **E**. `FP_PX` 256 and `fingerprint()` (fetch with `credentials: "include"`, `Worker`, `putItems`) -> **X** (thumbnail fetch partly **A**, see D6). |
| `dhash.worker.ts` | 30 | **split** | `createImageBitmap`, `OffscreenCanvas`, resize -> **X**. The grey-and-compare loop -> **E** as `dhashFromGrid`. |
| `format.ts` | 22 | **split** | `isVideo`, `keyOf` -> **E** (used by candidates/groups/safety). `Intl.DateTimeFormat` formatters, `dims`, `fmtDuration` -> **X** (presentation). |
| `thumbnail.ts` | 2 | **A** | `thumbSrc` builds a Google URL suffix (`=w{px}-h{px}-c`). Used by `Thumb.tsx` (X) and `fingerprint.ts`. App imports it from the adapter. |
| `trash.ts` | 80 | **split** | `guardTrash`, `cycleOk`, `entryFailed`, `MAX_BATCH`, `JournalEntry`, `Counts` -> **E** (safety rules, delete log type). `loadJournal`/`saveJournal` (`localStorage`) -> **X**, behind the `Store` delete-log methods. `JournalEntry` has an `email` and `dedupKey`, which are Google-flavoured; they stay as-is. |
| `db.ts` | 81 | **split** | IndexedDB open/put/list/clear -> **X** (the `Store` implementation). `toRow(account, RawItem)` maps GPTK field names to `ItemRow` -> **A**. |

### `src/shared/`, `src/types/`

| File | Layer | Notes |
| --- | --- | --- |
| `shared/protocol.ts` | **split** | `APP_ID`, `Command`, `CommandRequest/Response`, `BridgeMessage`, `PingResult`, `FirstPageResult`, `TrashArgs`, `TrashListResult`, `ListPageArgs`, `ListPageResult` -> **A** (wire format between adapter parts). `RawItem` (GPTK field names) -> **A**. Nothing here belongs in the engine. |
| `types/gptk.d.ts` | **A** | `unsafeWindow` declaration. |

### `src/content/`

| File | Layer | Notes |
| --- | --- | --- |
| `main-world.ts` | **A** | Browser-only. GPTK import, `WIZ_global_data` reads (`oPEP7c` = email, `eptZe` = path), command allow-list, **`checkedKey`** (one key + account match before every trash/restore), only `moveItemsToTrash` and `restoreFromTrash` reachable. |
| `bridge.ts` | **A** | `chrome.runtime.onMessage` <-> `window.postMessage`, 30 s timeout. |

### `src/services/`

| File | Layer | Notes |
| --- | --- | --- |
| `tabs.ts` | **A** | `chrome.tabs.sendMessage` wrapper. |
| `accounts.ts` | **A** | Find or open `/u/N/` tab, ping with retry (12 tries, one reload on "Receiving end does not exist"), slot and email check, `SLOT_FOR = {A:0, B:1}`. Becomes `MediaSource.listAccounts()`. |
| `library.ts` | **split** | Paging loop (700 ms pause, 4 retries, backoff `2000 * 2^n`) -> **A**, becomes the `listItems()` async iterator. Progress type -> A or X. It also calls `listAccountItems`, `clearAccount`, `putItems` (the "keep fingerprints across rescans" logic) -> that persistence belongs in **X** (consumes the iterator and writes to the Store). Contains a debug `console.log` of the first raw item; kept as-is. |
| `trash.ts` | **A** | `verifyTab` (identity + slot + "tab runs old page script" check) and `trashKeys` (paced read-only Trash listing). Becomes part of `trash()`/`restore()`. |

### `src/background/`

| File | Layer | Notes |
| --- | --- | --- |
| `index.ts` | **X** | Opens the dashboard on icon click. |

### `src/app/`

All **X**: `main.tsx`, `App.tsx`, `components/*`, `pages/*`, `styles/*`, `viewmodel.ts`, `hooks/useUnisnap.ts`. Details of the mixing are in section 3.

### Root and config

| File | After the move |
| --- | --- |
| `dashboard.html`, `public/manifest.json`, `config/*.ts`, `tsconfig.json`, `package.json` | into `apps/extension` (root keeps only workspace config, shared base tsconfig, ESLint, Vitest config) |
| `vendor/gptk` (submodule) | stays at repo root: moving a submodule is fiddly, and it is a path import. Adapter and content-script build refer to it by relative path. **Not** an npm workspace (it has its own `pnpm-lock.yaml`). |
| `scripts/*.py`, `seed/`, `docs/`, `README.md` | stay at root. README needs a path update at the end. |

## 3. Where pure logic is mixed with Chrome/DOM code

1. **`core/fingerprint.ts`**: `hamming` and thresholds share a file with a module-level `Worker` manager, `fetch(..., {credentials:"include"})`, and `putItems`. `matching.ts` imports it for `hamming`, so the "pure" matching module transitively pulls in IndexedDB code.
2. **`core/trash.ts`**: safety rules and `localStorage` access are in the same file.
3. **`core/db.ts`**: GPTK-to-model mapping (`toRow`) sits beside IndexedDB.
4. **`core/format.ts`**: engine-needed helpers (`isVideo`, `keyOf`) sit with `Intl` display formatting, and `candidates.ts`/`groups.ts` import it.
5. **`core/thumbnail.ts`**: Google-specific URL logic is in `core`, and the UI imports it.
6. **`shared/protocol.ts`**: GPTK field names (`RawItem`) and wire types.
7. **`services/library.ts`**: paging and backoff are mixed with IndexedDB persistence and fingerprint preservation.
8. **`app/hooks/useUnisnap.ts`** is the biggest mix (315 lines). It holds React state, `localStorage`, `crypto.randomUUID`, and calls to `chrome`-backed services. Embedded in it are:
   - pure safety checks: keep-one-per-group, 100 cap, per-item `guardTrash` loop (-> engine, D9);
   - the trash verification sequence: Trash listing, relist, compare counts (stays in app, it is workflow);
   - pacing constants: 200 ms between fingerprint fetches, 500 ms between trash calls, 2500 ms settle delay. These are request pacing, so they belong with whoever makes the request. Today they are in the hook, so moving them into the adapter would change timing code location only. I would **leave them in the app for now** and flag it, since `MediaSource.trash()` taking a list implies the adapter paces them. Decision needed at step d (see Q3).
9. **`app/viewmodel.ts`** imports `guardTrash` (engine function) and wraps it. This is fine as an app -> engine dependency.
10. **UI importing core**: pages import `classify`, `buildGroups`, `keepFor`, `cycleOk`, `format`. After the move these become `@unisnap/engine` imports (fine, direction is app -> engine).

Not a problem (already clean): `candidates.ts`, `matching.ts` (apart from the import), `groups.ts`, `types.ts`, `bridge.ts`, `tabs.ts`.

## 4. Target layout

```
package.json                 workspaces: apps/*, packages/*
tsconfig.base.json
vendor/gptk/                 (submodule, unchanged location)
packages/
  engine/                    pure TS, lib: ES2022 only, Vitest in Node
    src/{types,candidates,matching,groups,fingerprint(hamming,dhashFromGrid),safety(guardTrash,cycleOk,entryFailed,MAX_BATCH,...),keys(isVideo,keyOf),interfaces(MediaSource,Store)}.ts
  adapter-google-photos/     browser-only
    src/{main-world,bridge,protocol,tabs,accounts,library(list),trash,thumbnail,toItem}.ts, gptk.d.ts
apps/
  extension/                 dashboard, service worker, IndexedDB Store, dhash worker, manifest, vite configs
  mobile/README.md           placeholder only
```

Dependencies only flow `apps -> adapters -> engine`. The engine imports nothing. The adapter imports the engine for types only (`MediaItem`, `MediaSource`).

Engine interfaces (as sketched in your brief; exact shapes agreed at step b):

- `MediaSource`: `listAccounts()`, `listItems(account)` as `AsyncIterable<MediaItem[]>` (one page per yield, which maps to today's pages), `getThumbnailPixels(item, size)`, `trash(items)`, `restore(items)`. Contract states: trash only, account verified before every call, never permanent delete.
- `Store`: `saveItems/loadItems`, `saveFingerprints/loadFingerprints`, `saveMatches/loadMatches` (unused today, D10), `appendDeleteLog/loadDeleteLog/updateDeleteLog`.

## 5. Baseline plan (before any move)

Tests that run today against the current code in plain Node, with no source changes. All of `candidates`, `matching`, `groups`, `format`, `trash`'s pure functions import cleanly in Node, because `indexedDB`, `localStorage`, `Worker` and `fetch` are only touched inside functions, never at import time.

Fixtures (hand-built `ItemRow` arrays, plus real shapes from the seed answer key):

| Area | Cases |
| --- | --- |
| `findCandidates` | exact copy across accounts; resized copy (aspect within 2%); time gap 2000/2001 ms; aspect 2%/2.01%; shared timestamp (3 photos) -> `timeTrusted=false`; video vs photo; two videos 999/1001 ms apart; not-owned item; missing capture time; same-account pair; output sort order |
| `hamming`, `classify` | 0, 6, 7, 12, 13 bits; `sameDedupKey` wins over distance; `undefined` distance |
| `buildGroups` | exact; similar (<=6 bits, 0 ms, trusted); alike (7-12 bits; or untrusted time); burst (>50 ms); chain of 10 burst frames into one group; `hasVideo`; group order; `maxDistance`/`maxGapMs`; `keep` default; `accounts` |
| `keepFor` | all 6 rules, A/B fallback to default when the account has no copy |
| `guardTrash` / `cycleOk` / `entryFailed` | each refusal reason; single vs batch cycle verification |
| dhash | **cannot be baselined today**: the 64-bit loop is inside the worker. In step c, I first extract `dhashFromGrid` with a test using fixed RGBA grids, with expected hashes computed by running the *current* worker code on the same grids in a browser console or Node harness, before moving it. The canvas-resize half stays covered by the manual check. |

Expected values are generated by running the **current** functions and snapshotting (`toMatchInlineSnapshot` or JSON files in `__fixtures__`), then reviewed by eye for obvious sense. These are characterisation tests: they pin what the code does, not what it should do.

**Real-scan baseline (you run it):** a table in `docs/BASELINE.md` with, per run: items listed A/B, candidate pairs, scored pairs, and group counts by kind (exact / similar / alike / burst), items per kind, maxDistance of the largest group. The dashboard's POC checks page shows most of these; I will add a copy-paste-able summary line to the checklist, not to the UI (no UI changes). Please run it on the exact same two accounts, since libraries change.

## 6. Migration plan

Branch `restructure-engine` from the commit that contains the current working-tree changes (D2). One commit per step. After each: `npm run build`, tests, a manual checklist, and I wait for "ok".

**Step 0 (baseline, no moves)**
- Add vitest, a root `vitest.config.ts`, the characterisation tests under `src/core/__tests__` (they move along with the code later), and `docs/BASELINE.md` with a blank scan table.
- Commit: "test: baseline for matching logic".
- You: run a real scan, fill in the table.

**Step a: workspaces, move extension unchanged**
- `git mv` everything extension-related into `apps/extension` (`src`, `config`, `public`, `dashboard.html`, `tsconfig.json`, extension `package.json`); root `package.json` becomes workspace config; update relative paths in the Vite configs (`root`, alias, the `../../vendor/gptk` import path, output dir).
- `dist/` is now `apps/extension/dist`; you will have to **re-point "Load unpacked"** at the new folder. Flagged in the checklist.
- Risk: moving `node_modules` and the lockfile; submodule path. Low.
- Check: `npm install`, `npm run build`, load, scan, same counts as baseline.

**Step b: `packages/engine` skeleton**
- Types (`MediaItem`, `Fingerprint`, `MatchGroup`, `MatchType`, `GroupKind`, `KeepRule`, `Label`) and the `MediaSource` and `Store` interfaces. Engine tsconfig with ES2022 lib only. No code moves yet; nothing imports it.
- Tests: type-level only; build passes.

**Step c: move pure logic, one piece per commit** (baseline tests move with their code and must stay green)
1. `types` + `keys` (`isVideo`, `keyOf`): rename `ItemRow` -> `MediaItem` here, mechanical only. The app imports from the engine.
2. `fingerprint` pure part (`hamming`, thresholds); `matching.ts` stops importing the old file.
3. `candidates`.
4. `matching`.
5. `groups` (+ `keepFor`; `KEEP_RULES` labels move to the app).
6. `safety`: `guardTrash`, `cycleOk`, `entryFailed`, `MAX_BATCH`, `JournalEntry`; then the extracted `assertKeepsOneCopy`/`assertBatchSize` (D9), each with a test showing the same refusal messages the hook throws today.
7. `dhashFromGrid` (D4), the worker calls it; tested with the grid fixtures above.
8. **Generalise accounts** (own commit, after 1-7): `Label` -> `AccountId = string`. `findCandidates(items: MediaItem[])` takes all items and pairs across and within accounts, in the same generation order as today for two accounts (cross pairs by account order, then within each account), so output order is unchanged. `KeepRule` becomes `"largest" | "smallest" | "oldest" | "newest" | { account: AccountId }`; `KEEP_RULES` labels and "Copy in account A/B" move to the app. `cycleOk` checks *every other* account. `Counts` becomes `Record<AccountId, number>` (same stored shape). Rule: the existing tests pass with only their fixtures' call shape adapted, never their expected values; add 3-account tests (cross pairs, groups spanning 3 accounts, keep rules, cycle check).
- After 7, `src/core` in the extension should only contain: `db.ts` (IndexedDB), thumbnail fetch, `format` (display), the journal's `localStorage` wrapper.

**Step d: `packages/adapter-google-photos`**
- Move `content/*`, `services/tabs|accounts|library|trash`, `shared/protocol.ts`, `thumbnail.ts`, `toRow`, `gptk.d.ts` into it. Vendor import path updated.
- Implement `MediaSource` on top: `listAccounts` = `attach`, `listItems` = the paging loop as an async iterator, `trash`/`restore` = `verifyTab` + `trashItem`/`restoreItem` one item per call, `getThumbnailPixels` = fetch + decode (D6).
- The content-script Vite builds stay in `apps/extension` (they produce extension files) but take their entries from the adapter package. Manifest unchanged.
- Risk: **medium**, as this touches every call that talks to Google. Safety checks (`checkedKey`, `verifyTab`) are moved verbatim and not rewritten.

**Step e: rewire `apps/extension`**
- `useUnisnap` uses `MediaSource` and `Store` instead of importing services and `db` directly. `db.ts` becomes `IndexedDbStore implements Store`. The journal's `localStorage` becomes the delete-log part of the Store.
- Pacing location decided (Q3). No change to timings.
- Risk: **highest** (the hook is the largest and least tested file). I will keep the hook's public return shape identical so no page or component changes.

**Step f: enforce boundaries**
- Engine tsconfig: `lib: ["ES2022"]`, `types: []` (so `chrome`, DOM and Node globals are not visible).
- ESLint, a new devDependency (ask; D3-type approval needed): `no-restricted-globals` (`window`, `document`, `chrome`, `fetch`, `indexedDB`, `localStorage`, `Worker`), `no-restricted-imports` for `chrome`/`react`/adapter packages inside `packages/engine`. Plus a check that the adapter does not import from `apps/*`. A one-line `npm run check:boundaries` in CI/pre-commit.
- Tests: a deliberately bad import in a scratch file is rejected by lint (verified once, not committed).

**Finish:** `ARCHITECTURE.md` (layer diagram, what goes where, known limits D5/D7), `ADDING_A_WRAPPER.md`, README path updates, `apps/mobile/README.md` placeholder (created at step b or f; empty of code).

## 7. Risks

| Risk | Mitigation |
| --- | --- |
| Extension dir moves, so the unpacked extension path changes and an open Photos tab keeps the old content scripts. | Checklist tells you to reload the extension, then the Photos tabs. |
| `vendor/gptk` imported by relative path; Vite `define: unsafeWindow` only applies to the content-script build. | Keep that build config in the extension and test `ping` after step a and step d. |
| Step e touches the hook that gates trash. | Pure checks extracted with tests first (step c.6); orchestration is moved, not rewritten; manual trash and restore cycle on a test account is part of that step's checklist. |
| Characterisation tests pin today's behaviour including quirks, so a good bug fix would later look like a failure. | Intended. Behaviour changes are out of scope; note quirks as comments in the tests. |
| Existing IndexedDB (`unisnap-poc` v1) and the `localStorage` keys (`unisnap-trash-journal`, `unisnap-last-scan`) must keep their names and shape. | Not renamed. Moving the extension to a new folder changes its ID if no `key` is in the manifest, which **resets** IndexedDB/localStorage (separate origin). You would need to rescan, and the Trash journal would be empty. Flagged in step a; see Q4. |

## 8. Open questions

- **Q1** (D2) Commit the current changes on `main` first?
- **Q2** (D3/D4/D6/D7/D8/D10) OK with the recommendations above, in particular: npm workspaces, adding Vitest, `dhashFromGrid` on a 9x8 grid (no resize in the engine), `Label` staying `"A" | "B"`.
- **Q3** Pacing (200/500/2500 ms): leave in the app (zero behaviour risk) or move into the adapter's `trash()`/`restore()`/`getThumbnailPixels()`? I recommend **leave in the app**, and revisit after the restructure.
- **Q4** Moving to `apps/extension/dist` gives Chrome a new extension ID for an unpacked load from a new path, so saved IndexedDB data and the Trash journal in the old install will not carry over. Acceptable (rescan), or should I add a stable `key` to the manifest first (a manifest change, not a behaviour change, but I would not do it without your say)? Note: if you reload the same folder path, the ID stays. The path changes only if you point Chrome at the new folder.
- **Q5** ESLint is not installed today. Approve adding `eslint` + `typescript-eslint` for step f?
