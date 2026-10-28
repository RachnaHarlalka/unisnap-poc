# Unisnap POC findings

Run on 26 Oct 2026, two fresh test Google accounts (`unisnap.test.a@gmail.com`, `unisnap.test.b@gmail.com`) signed in to one Chrome profile. Seed set: 50 photos per account, built by `scripts/make_seed.py` from free stock photos (answer key: `seed/ANSWER_KEY.csv`).

## Verdict

**Feasible with tuning.** H1, H2, H3 and H5 passed. H4 found every seeded copy (20 of 20 exact, 10 of 10 resized) but **fails the look-alike test**: 8 of 25 different burst frames fell at or under the spec's limit of 6 bits, and four of them (1, 1, 1 and 3 bits) sit inside the range of true resized copies (0 to 3 bits). The 64-bit dHash alone cannot separate them. Capture-time gap separates them in this data, but that rule has real-world risks (see H4).

| Result | Meaning | Next move |
| --- | --- | --- |
| H4 has misses or false matches | Feasible with tuning | Keep the capture-time rule, confirm the cutoff on more data, try PDQ if distances overlap, then re-run. |

H2 and H5 passed, so the GPTK route is not blocked.

## Hypotheses

| # | Hypothesis | Result | Numbers |
| --- | --- | --- | --- |
| H1 | GPTK runs in two account tabs at once | **Pass** | `/u/0/` returned `unisnap.test.a@gmail.com`, `/u/1/` returned `unisnap.test.b@gmail.com`. Both returned a first page of items. |
| H2 | Full library listed with metadata | **Pass, with a gap** | A 50, B 50 listed, 0 retries, 1 page each. Counts matched Google Photos: with small libraries (4 and 6) exactly, and during the trash test Google Photos itself showed A 49 and B 50, the same as the dashboard. Paging is untested (see below). |
| H3 | `dedupKey` equal for an identical file across accounts | **Pass** | 20 of 20 seeded exact copies share a key (4 of 4 in the first small test). No item lacked a key. |
| H4 | Fingerprints find copies `dedupKey` misses | **Copies pass, look-alikes fail** | 55 candidate pairs: 20 exact, 10 resized, 25 look-alike (5 x 5). Resized: **10 of 10 matched**, distances 0 to 3 (mean 0.9). Look-alikes: **8 of 25 pairs at 6 bits or fewer** (false matches by the spec's rule), 10 at 7 to 12, 7 at 13 to 17. None came out as Exact. |
| H5 | One chosen copy to Trash and back | **Pass** | A's copy moved: A 50 to 49, B stayed 50, item listed in A's Trash. After restore: A 50, B 50. Verified by the tool's five checks. |

### H2: what is and is not proven
- The listing works and returns every field the data model needs (see Data model notes).
- 50 items arrived in a single page, so the `nextPageId` loop, the 700 ms pauses and the exponential backoff have never run. A library larger than one page is needed to test them.
- Google Photos' own counts matched ours (49 and 50 seen in Google Photos during the trash test; 4 and 6 in the early run). The exact 50 and 50 view was not separately recorded.

### H4: what the data shows

Distances are Hamming bits out of 64, from the dashboard's own export.

| Set | Pairs | Distances | Outcome |
| --- | --- | --- | --- |
| Exact copies | 20 | all 0 | 20 of 20 share a `dedupKey` and hash identically |
| Resized copies (50%, re-saved JPEG) | 10 | 1, 0, 3, 0, 1, 2, 0, 2, 0, 0 (max 3) | 10 of 10 matched, no misses, `dedupKey` differs in all 10. Even a limit of 3 would catch all of them. |
| Look-alikes (5 A frames x 5 B frames) | 25 | 8 pairs at 1, 1, 1, 3, 4, 4, 5, 6; 10 pairs at 7 to 12; 7 pairs at 13 to 17 | **8 false matches** at the spec's limit of 6 |
| Unique photos | n/a | n/a | Never became candidates (different dates), so no false matches |

- **Distance alone cannot separate copies from look-alikes.** Look-alike pairs at 1, 1, 1 and 3 bits fall inside the resized-copy range (0 to 3). Tightening the limit to 3 still leaves 4 false matches, and the earlier real burst pair (two different party photos, 1315 ms apart) came out at 5 bits as well.
- **Capture time separates them in this data.** Resized copies are 0 ms apart; every look-alike pair is at least 150 ms apart (150, 450, 750, 1050 or 1350 ms). A cutoff of 50 ms splits the two sets perfectly here, so the app's Burst rule now uses 50 ms. The earlier 500 ms cutoff was too loose: it would have treated 12 of the 18 matched look-alike pairs as the same photo.
- **Risks of the time rule on real photos.** An editor that drops sub-second EXIF data can shift a copy by up to about 1 s, so a true copy could look like a burst frame. A real burst inside one second without sub-second data shows 0 ms and looks like a copy. The seed bursts are synthetic (a red shape moved on one background, 150 ms steps), so this is one data set, not proof.
- **Grouping.** The 18 look-alike pairs at 12 bits or fewer connected all 10 burst frames into one Burst group (max distance 12, gap up to 1350 ms). Pair-connected grouping chains unrelated frames.
- **Folder swap.** The dashboard shows account A holding the 800 x 600 files and B the 1600 x 1200 ones, so the two seed folders were uploaded to the opposite accounts. Harmless for matching, but it flips which side the "suggested keep" favours.
- **Trash test.** The verified cycle was run on an A copy, not B (the spec's example picks B). The result is the same: only the target account changed.

**Tuning to try next:** a larger hash (for example 16 by 16, 256 bits) or PDQ on the same 55 pairs, to see if distances for copies and look-alikes stop overlapping; then decide whether capture time is needed at all.

## First look at a real library (28 Oct)

Running the tool on real libraries (about 2300 photos) showed two problems the seed data could not:

- **False "Similar" groups.** Several different photos of the same person (different outfits, same room) were grouped as Similar at 12 of 64 bits and 0 ms apart. All had an identical capture time, which is what photos with no real capture time get (screenshots, chat photos, imports). A shared stamp is not evidence, and 12 bits is too loose for "the same photo".
- **Videos** were handled as photos, using one poster frame, and the duration was never stored.

Fixes applied:
- "Similar" now needs every non-exact pair within 6 bits **and** a capture time that means something. A time shared by 3 or more photos in one account is treated as unknown.
- Anything weaker, including 7 to 12 bits, is a new **Looks alike** group: shown for review, never part of the bulk mark.
- The video duration is stored. A video is never paired with a photo, two videos must be within 1 s of each other in length, and any group with a video is excluded from the bulk mark. Videos are flagged with a badge and their length.
- Checked on made-up cases covering shared timestamps, 9-bit pairs, bursts, exact copies and video pairing. Existing saved items have no duration until the libraries are scanned again.

## Not yet verified

These were not measured, so the report does not claim them:
1. **Paging beyond one page**, and the backoff path.
2. **False-match rate on real look-alikes.** One real pair plus a synthetic set is not enough.
3. **Multi-select Trash and Restore all** (built after this report was first written; not yet run against Google Photos).
4. **A larger hash or PDQ.** Not tried, so it is unknown whether it removes the overlap.
5. **Rotated copies.** Aspect ratio is compared as stored width over height, so a 90-degree rotated copy would not pair. Not tested.
6. **Resized copies whose editor strips EXIF.** Step 6 pairs on capture time, so those would be missed. Not tested.

## Errors seen

| Error | Cause | Fix |
| --- | --- | --- |
| `Could not establish connection. Receiving end does not exist.` | A Photos tab opened before the extension was reloaded has no live content script. | Dashboard now reloads that tab once automatically. |
| `Expected slot /u/1/ but page reports path /u/0/` | Account B was not signed in to this Chrome profile; Google silently served account 0 at `/u/1/`. | Sign B in on the website in the same profile. The slot check caught it, so A was never labelled twice. |
| Broken thumbnails (grey boxes) | Plain `<img>` loads of the thumbnail URL failed. | Fetch the thumbnail with the extension's host permission and show it as a blob. |
| `Unknown command: trashItem` | Dashboard was new, but the Photos tab still ran the old page script (content scripts only update after an extension reload and a tab reload). Nothing was moved. | Dashboard now checks the tab's command list first and tells you to reload. |
| Stale results after rescanning | Rescan wiped saved fingerprints. | Rescan now keeps fingerprints by item ID. |
| Trash buttons disabled | Connection to the accounts lives in memory and is lost on every reload. | Buttons now say "Connect first". |

## What surprised us

1. **The list already contains `dedupKey`, dimensions, capture time and a thumbnail URL.** No per-item call is needed for steps 5 to 7. File size is not in the list and would need `getItemInfoExt` per item.
2. **Thumbnails are served from `photos.fife.usercontent.google.com`**, which is not covered by `*.googleusercontent.com`. `https://*.usercontent.google.com/*` had to be added to the host permissions.
3. **A missing account slot does not fail.** `/u/1/` quietly serves account 0, so the extension must verify identity and slot on every tab.
4. **Content scripts and the dashboard update separately.** The dashboard reads fresh files on reload; the page script in a Photos tab does not. This caused the most confusion during testing.
5. **dHash at 9 by 8 is coarse.** Different burst frames differed by as little as 1 bit, which is less than some real resized copies (3 bits).
6. **Trash and restore worked with the same `dedupKey` that the list returned**, including for a key shared with the other account, because each call went only to one account's tab.

## Safety rules, as built

- Read-only by default. The only write path is Move to Trash, behind a switch that is off at every page load and never saved.
- Trash and restore only. No call that empties Trash or deletes permanently exists in the code (`main-world.ts` exposes `trashItem`, `restoreItem`, `listTrash` and read-only listing).
- One item per call, only an item the user clicked and confirmed. The call goes only to the tab of the item's own account. The dashboard and the page script both refuse if the tab's signed-in email does not match.
- Favourites, photos the account does not own, and keys shared by several items in one account are refused.
- Requests are paced: one at a time per tab, 700 ms between pages, exponential backoff, stop after repeated failures.
- No server, no analytics. The only external requests go to Google Photos itself. The Inter font is bundled.
- Every photo moved to Trash is journalled so it can be restored after a reload.

## Data model notes

Field names as GPTK returns them: `mediaKey`, `timestamp` (capture time, ms), `creationTimestamp` (upload time, ms), `dedupKey`, `thumb`, `resWidth`, `resHeight`, `isFavorite`, `isOwned`, `isArchived`, `isLivePhoto`, `geoLocation`, `isPartialUpload`, `timezoneOffset`. Stored in IndexedDB database `unisnap-poc` (`items`, `matches`). The `matches` store is created but not used; groups are computed on the fly.

## For phase 1

- **Match tiers.** Exact (same `dedupKey`), Similar (fingerprint match and an almost identical capture time, 50 ms in the seed data), Burst (fingerprint match, different capture time). Similar and Burst ask the user; only Exact and Similar are safe to pre-select. The time rule needs a stronger hash behind it before real use.
- **Burst grouping.** Chaining joins unrelated frames. Group by time window instead of by connected pairs.
- **Suggested keep.** Today it is most pixels, then earliest upload, which is arbitrary for identical files. Use a neutral label for Exact, or a "prefer this account" setting.
- **Account onboarding.** Open Google's add-account page (`accounts.google.com/AddSession`) from the extension, then discover slots by probing `/u/0/`, `/u/1/` and so on until a slot falls back to an earlier account. All accounts must be signed in to one Chrome profile.
- **Sizes.** Fetch `getItemInfoExt` only for photos inside a group, to show "Saves X MB".
- **Same-account duplicates** are now compared too (added after the first run). Exact copies inside one account share a key, and Google's trash call works by key, so the tool refuses to trash them.
- **Rescan cost.** Keeping fingerprints by item ID is enough for now; a changed thumbnail for the same item would need invalidation.
