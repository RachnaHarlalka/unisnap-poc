# POC spec: cross-account Google Photos duplicate finder (for Claude Code)

Oct 25, 2026 · @Rachna

## Goal

The POC answers one question: can a Chrome extension list two Google Photos accounts, find photos that exist in both, and move a chosen copy to Trash in the right account? It is a throwaway prototype for learning, not the product.

| # | Hypothesis | Pass test |
| --- | --- | --- |
| H1 | GPTK runs in two account tabs at once (`/u/0/` and `/u/1/`) | Both tabs return the signed-in account's identity and a first page of items |
| H2 | The full library of each account can be listed with metadata | Item counts match the counts shown in Google Photos, within 1% |
| H3 | Google's `dedupKey` is the same for an identical file in both accounts | The seeded exact copies share a `dedupKey` across accounts |
| H4 | Thumbnail fingerprints find copies that `dedupKey` misses | The seeded resized copies are matched; no false matches among the seeded look-alikes |
| H5 | One chosen copy can be moved to Trash in the correct account, and restored | The item disappears from that account's library only, and comes back after restore |

H3 is a shortcut, not a blocker: if it fails, H4 carries exact matching too.

## Test setup

Run the POC on two fresh test Google accounts first, never on your real libraries. Seed them with a small set where you already know the right answer.

| Seed set | Account A | Account B | Expected result |
| --- | --- | --- | --- |
| Exact copies | 20 photos | Same 20 files | 20 matches, same `dedupKey` if H3 holds |
| Resized copies | 10 photos at full size | Same 10, resized to 50% and re-saved as JPEG | 10 matches via fingerprint |
| Look-alikes | 5 burst frames | 5 different frames of the same burst | Shown as similar, never as exact |
| Unique | 15 photos | 15 different photos | No matches |

That is 50 photos per account. Upload them through the Google Photos website, signed in to each account in the same Chrome profile. Keep a copy of the seed folder; it is the answer key for the results report.

## POC architecture

&#91;embedded content: POC architecture · dashboard, service worker, two account tabs\]

GPTK must run in the page's MAIN world because it relies on the page's own JavaScript globals; a normal content script cannot see them. The highlighted boxes are the riskiest part of the POC and the first thing to get working (build step 2).

## Build steps

Build in this order and stop at each checkpoint. Each step ends with something you can see working.

1. **Scaffold the extension.** Manifest V3, TypeScript, Plasmo (or Vite), React for one dashboard page. Add GPTK as a git submodule pinned to one commit. Host permissions: `https://photos.google.com/*` and `https://*.googleusercontent.com/*`.
   - Checkpoint: the extension loads unpacked and opens an empty dashboard tab.
2. **Bridge GPTK into the page.** GPTK needs the page's own JavaScript globals, so inject it with a content script in the `MAIN` world. A second content script in the isolated world relays messages between the page (`window.postMessage`) and the extension (`chrome.runtime` messaging).
   - Checkpoint: from the dashboard, a "ping" reaches GPTK in a photos.google.com tab and returns.
3. **Attach two accounts (H1).** The dashboard opens or finds tabs for `photos.google.com/u/0/` and `/u/1/`, asks each tab which account it is signed in to, and labels them A and B.
   - Checkpoint: the dashboard shows two different account emails.
4. **List both libraries (H2).** Page through `getItemsByUploadedDate` in each tab, slowly (one page at a time, short pause, back off on errors). Save every item to IndexedDB with its account label. Log one raw item to the console so the real field names are known.
   - Checkpoint: per-account counts on the dashboard match Google Photos.
5. **Test `dedupKey` across accounts (H3).** Fetch `dedupKey` per item if the list does not include it (GPTK's `getItemInfoExt`). Count keys that appear in both accounts.
   - Checkpoint: report how many of the 20 seeded exact copies share a key.
6. **Find candidates from metadata.** Pair items across accounts whose capture time is within 2 seconds and whose aspect ratio is within 2%. This keeps fingerprinting to a short list.
   - Checkpoint: the 30 seeded copies all appear as candidates.
7. **Fingerprint candidates (H4).** Fetch each candidate's small thumbnail (about 256 px) from the service worker or dashboard, which avoids page CORS limits. In a Web Worker, compute a 64-bit dHash; mark a match at Hamming distance 6 or less. PDQ is optional if a JavaScript or WebAssembly build is easy to add.
   - Checkpoint: the 10 resized copies match; the 5 look-alikes do not count as exact.
8. **Show results.** One dashboard table of matched pairs: both thumbnails side by side, account, file size, match type (`dedupKey`, fingerprint, or similar), and distance. A summary line: pairs found per type and the space a cleanup would free.
   - Checkpoint: the table agrees with the answer key.
9. **Trash one copy and restore it (H5).** Behind a "dangerous actions" switch that is off by default, let the user pick one pair and move account B's copy to Trash with `moveItemsToTrash`, sent to account B's tab only. Re-list to verify, then restore it (GPTK's restore function if present, otherwise by hand in Google Photos).
   - Checkpoint: the copy leaves account B, account A is unchanged, and the restore brings it back.
10. **Write the findings.** A `FINDINGS.md` that answers H1 to H5 with numbers, lists every error seen, and notes anything that surprised you.

## Data model

Two IndexedDB stores are enough. Field names from GPTK may differ; map them after logging a raw item in step 4.

| Store | Field | Notes |
| --- | --- | --- |
| `items` | `account` | `A` or `B` |
| `items` | `mediaKey` | GPTK's item id, unique per account |
| `items` | `dedupKey` | Used for trash calls; tested for cross-account equality |
| `items` | `captureTime`, `uploadTime` | Epoch milliseconds |
| `items` | `width`, `height`, `sizeBytes` | Size may need `getItemInfoExt` |
| `items` | `thumbUrl` | Base thumbnail URL; append a size suffix when fetching |
| `items` | `isOwned`, `isFavorite` | Skip items not owned; flag favourites |
| `items` | `dhash` | Hex string, filled only for candidates |
| `matches` | `itemA`, `itemB` | `mediaKey` of each side |
| `matches` | `type` | `dedupKey`, `fingerprint`, or `similar` |
| `matches` | `distance` | Hamming distance, empty for `dedupKey` matches |

## Safety rules

The code must follow these rules without exception.

- Read-only by default. The only write is step 9, behind a switch that starts off.
- Trash only. Never call any function that empties Trash or deletes permanently.
- One item per trash call in the POC, and only an item the user clicked.
- Every trash call names its target account and is sent to that account's tab only; refuse if the tab's account does not match.
- Never touch favourites or items the account does not own.
- Pace requests: one request at a time per tab, a short pause between pages, exponential backoff on errors, stop after repeated failures.
- Nothing leaves the browser: no server, no analytics, no remote logging.
- Test accounts only until every hypothesis passes.

## Go or no-go

The idea is viable if H2, H4 and H5 pass. H1 and H3 only change speed and convenience.

| Result | Meaning | Next move |
| --- | --- | --- |
| All pass | Feasible as designed | Build phase 1 of the plan |
| H3 fails, others pass | Feasible; fingerprints do all matching | Continue; no change to the product |
| H4 has misses or false matches | Feasible with tuning | Tune thresholds or try PDQ, then re-run |
| H1 fails (only one account works at a time) | Feasible but slower | Scan accounts one after another, store results, compare after |
| H2 or H5 fails | GPTK route blocked | Fall back to Takeout for finding, manual deletion in Google Photos |

## Out of scope

Leave these for after the POC: more than two accounts, bulk deletion, keep rules, best-shot picking, image embeddings, videos, a polished UI, resumable scans, real (non-test) libraries, and Chrome Web Store publishing.

## Prompt for Claude Code

Download this doc as Markdown, save it in an empty folder as `POC_SPEC.md`, open Claude Code there, and paste:

```markdown
Read POC_SPEC.md fully before writing any code. Build the proof of concept it describes: a Manifest V3 Chrome extension that tests hypotheses H1 to H5 on two test Google Photos accounts.

Rules:
- Follow the Build steps in order. After each step, stop, tell me how to verify its checkpoint, and wait for my result before continuing.
- Study the Google Photos Toolkit (GPTK) source before step 2: https://github.com/xob0t/Google-Photos-Toolkit. Use its API rather than writing your own calls to Google. Also read how Google Photos Deduper wires GPTK into an extension: https://github.com/mtalcott/google-photos-deduper (AGPL: read for ideas, do not copy code).
- Obey every rule in Safety rules. Never write code that empties Trash or deletes permanently.
- Keep everything in the browser: no server, no analytics.
- When something fails, show me the exact error and your best guess, then propose the smallest fix.
- At the end, write FINDINGS.md answering H1 to H5 with numbers, using the Go or no-go table.
```

## Sources

- [Google Photos Toolkit (GPTK)](https://github.com/xob0t/Google-Photos-Toolkit): `getItemsByUploadedDate`, `getItemInfoExt`, `moveItemsToTrash`
- [Google Photos Deduper](https://github.com/mtalcott/google-photos-deduper): MV3 extension built on GPTK and Plasmo
- [Updates to the Google Photos APIs](https://developers.google.com/photos/support/updates): why the official Library API cannot be used
- [Feasibility and build plan](https://claude.ai/artifact/Tcp4r1xKUZMj4dezdvAeFs): the full product plan this POC tests
