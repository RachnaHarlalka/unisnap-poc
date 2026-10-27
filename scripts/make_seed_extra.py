"""Extra seed set for testing same-account duplicates and multi-select.

Output: <out>/A and <out>/B plus ANSWER_KEY_extra.csv. Same helpers and photo source as make_seed.py.
Run:  python -I scripts/make_seed_extra.py <output_dir> <cache_dir>
"""
import csv
import datetime as dt
import io
import shutil
import sys
import time
import urllib.request
from pathlib import Path

import piexif
from PIL import Image

OUT, CACHE = Path(sys.argv[1]), Path(sys.argv[2])
W, H = 1600, 1200
rows = []


def fetch(seed: str) -> Image.Image:
    f = CACHE / f"{seed}.jpg"
    if not f.exists():
        req = urllib.request.Request(
            f"https://picsum.photos/seed/unisnap-{seed}/{W}/{H}.jpg", headers={"User-Agent": "unisnap-poc-seed"}
        )
        f.write_bytes(urllib.request.urlopen(req, timeout=30).read())
        time.sleep(0.3)
    return Image.open(io.BytesIO(f.read_bytes())).convert("RGB")


def exif_for(t: dt.datetime) -> bytes:
    stamp = t.strftime("%Y:%m:%d %H:%M:%S").encode()
    return piexif.dump({
        "0th": {piexif.ImageIFD.Make: b"UnisnapTest", piexif.ImageIFD.DateTime: stamp},
        "Exif": {piexif.ExifIFD.DateTimeOriginal: stamp, piexif.ExifIFD.DateTimeDigitized: stamp, piexif.ExifIFD.SubSecTimeOriginal: b"000"},
    })


def save(img, path, t, quality=92):
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, "JPEG", quality=quality, exif=exif_for(t))


def at(day: int, i: int) -> dt.datetime:
    return dt.datetime(2026, 10, day, 10, 0, 0) + dt.timedelta(seconds=90 * i)


def small(img):
    return img.resize((W // 2, H // 2), Image.LANCZOS)


A, B = OUT / "A", OUT / "B"

# 1) Same-account copies: the original plus a smaller re-saved copy, both in ONE account.
for acct, folder, day, tag in (("A", A, 6, "sa"), ("B", B, 7, "sb")):
    for i in range(6):
        t, img = at(day, i), fetch(f"{tag}{i + 1:02d}")
        save(img, folder / f"in{acct}_{i + 1:02d}_full.jpg", t)
        save(small(img), folder / f"in{acct}_{i + 1:02d}_copy.jpg", t, quality=80)
        rows.append((f"in{acct}_{i + 1:02d}_full.jpg + _copy.jpg", acct, f"Similar group inside account {acct} (2 copies)"))

# 2) Three-copy groups: A has the original and a re-saved copy, B has the same original file.
for i in range(3):
    t, img = at(8, i), fetch(f"tr{i + 1:02d}")
    save(img, A / f"tri_{i + 1:02d}_full.jpg", t)
    save(small(img), A / f"tri_{i + 1:02d}_copy.jpg", t, quality=80)
    shutil.copyfile(A / f"tri_{i + 1:02d}_full.jpg", B / f"tri_{i + 1:02d}_full.jpg")
    rows.append((f"tri_{i + 1:02d}_full.jpg + _copy.jpg", "A+B", "Group of 3 across both accounts (A full, A copy, B full)"))

with open(OUT / "ANSWER_KEY_extra.csv", "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["files", "account", "expected"])
    w.writerows(rows)
print("A:", len(list(A.glob("*.jpg"))), "files · B:", len(list(B.glob("*.jpg"))), "files")
