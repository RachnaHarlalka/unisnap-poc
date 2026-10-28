# Unisnap

Find the same photo across several Google Photos accounts and move the extra copies to Trash.

> **Status: proof of concept.** Built to test whether the idea can work at all. Use test accounts only. Results are in [docs/FINDINGS.md](docs/FINDINGS.md); the plan it follows is [docs/POC_spec.md](docs/POC_spec.md).

## Why a Chrome extension

Google's official Photos APIs do not let an outside app read a whole library, so a website cannot do this. The extension works with the Google Photos page you are already signed in to, using [Google Photos Toolkit](https://github.com/xob0t/Google-Photos-Toolkit) (GPTK, MIT) for the requests. That relies on Google's unofficial internal calls, which can change without notice.

## Quick start

```bash
git submodule update --init      # fetches vendor/gptk
pnpm install
pnpm run build                    # writes the extension to apps/extension/dist/
```

1. Open `chrome://extensions`, turn on Developer mode, choose **Load unpacked**, pick the `apps/extension/dist/` folder.
2. In **one Chrome profile**, sign in to two test Google accounts (first one is `/u/0/`, second is `/u/1/`).
3. Click the extension icon to open the dashboard, then follow the three steps in the sidebar: **Connect accounts**, **Scan libraries**, **Find duplicates**.

After every `pnpm run build`: reload the extension on `chrome://extensions`, **then reload any open Google Photos tabs**. The dashboard reads fresh files on reload, but the scripts inside a Photos tab only update when that tab reloads.

### Test photos

`scripts/make_seed.py`, `scripts/make_seed_extra.py` and `scripts/make_seed_stress.py` build seed folders of free stock photos (exact copies, resized copies, burst look-alikes, same-account copies) with capture times in the EXIF data, plus an answer key.

```bash
python3 -m venv .venv && .venv/bin/pip install pillow piexif
.venv/bin/python -I scripts/make_seed.py seed .cache
.venv/bin/python -I scripts/make_seed_extra.py seed/extra .cache
.venv/bin/python -I scripts/make_seed_stress.py seed/stress   # 1000 generated photos per account, for load testing
```

Upload `seed/A` to the first account and `seed/B` to the second with the Google Photos website upload button. `seed/` is git-ignored.

## How it works

```
 Dashboard tab (React)  ──chrome.tabs.sendMessage──▶  bridge.js (isolated world, in each Photos tab)
                                                            │ window.postMessage
                                                            ▼
                                         main-world.js (page's own JS world) ── GPTK Api ──▶ Google Photos
```

GPTK needs the page's own JavaScript globals, so it runs in the page's `MAIN` world. A second script in the isolated world relays messages to the extension. Only an allow-list of commands is accepted.

Matching, in order: Google's own file key (`dedupKey`) finds identical files; capture time and shape shortlist candidates; a 64-bit difference hash of the thumbnail (computed in a Web Worker) finds resized or re-saved copies. Everything runs in the browser. There is no server and no analytics.

## Project layout

The repo is a pnpm workspace (`apps/*`, `packages/*`). Everything below currently lives in `apps/extension/`; the engine and adapter packages are added in later steps (see ARCHITECTURE_AUDIT.md).

```
apps/extension/
  src/
  background/     service worker: opens the dashboard when the icon is clicked
  content/        main-world.ts (runs GPTK in the page) and bridge.ts (relay)
  shared/         protocol.ts: the messages and types the parts exchange
  core/           pure logic, no React: database, candidates, fingerprints, groups, matching, trash rules
  services/       talking to Chrome tabs and Google Photos: tabs, accounts, library listing, trash checks
  app/            the dashboard
    components/   Sidebar, dialogs, thumbnail, small UI pieces
    pages/        Review, Libraries, Trash history, POC checks
    hooks/        useUnisnap: the one place that holds app state and actions
    styles/       tokens, base, layout, components, pages (imported by index.css)
  types/          global type declarations
config/           Vite builds (app + service worker, and the two content scripts)
public/           manifest.json
docs/             spec and findings
scripts/          seed-photo generators
vendor/gptk/      Google Photos Toolkit, pinned git submodule
```

Imports use the `@/` alias for `src/`. Dependencies point one way: `app` → `services` → `core`; `shared` is used by all.

## Safety rules

- Read-only by default. The only writes are move-to-Trash and restore, behind a switch that is off at every page load and never saved.
- Trash only. Nothing in this code empties Trash or deletes permanently.
- Each photo is moved in its own call, sent only to the tab of its own account. The dashboard and the page script both refuse if the tab is not signed in as the expected account.
- Every group keeps at least one copy. Favourites, photos you do not own, and keys shared by several items in one account are refused.
- Batches are capped at 100 photos, paced, and stop at the first error. A confirmation dialog shows counts per account; 10 or more photos also need the number typed.
- Every photo moved is journalled so it can be restored after a reload.

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm run build` | Type-check, then build everything into `apps/extension/dist/` |
| `pnpm test` | Run the unit tests (Vitest) |
| `pnpm run typecheck` | Type-check only |
| `pnpm run build:app` | Dashboard and service worker |
| `pnpm run build:content` | The two content scripts (single-file builds) |

## Not done yet

No automated tests, no listing past one page of results (untested), no Stop button for a running batch, no file sizes or "space saved", and videos are only flagged (never paired with photos, never bulk-marked) rather than compared properly. See [docs/FINDINGS.md](docs/FINDINGS.md) for what is and is not verified.

## Credits

[Google Photos Toolkit](https://github.com/xob0t/Google-Photos-Toolkit) by xob0t (MIT). The structure of [Google Photos Deduper](https://github.com/mtalcott/google-photos-deduper) (AGPL) was read for ideas; no code was copied.
