"""Build the POC seed folders from POC_spec.md using free stock photos (picsum.photos).

Output: seed/A and seed/B (50 files each) plus seed/ANSWER_KEY.csv.
Capture times are written to EXIF so Google Photos keeps them (step 6 pairs on capture time).
Run:  python -I scripts/make_seed.py <output_dir> <cache_dir>
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
from PIL import Image, ImageDraw

OUT = Path(sys.argv[1])
CACHE = Path(sys.argv[2])
W, H = 1600, 1200
key_rows = []


def fetch(seed: str) -> Image.Image:
    f = CACHE / f"{seed}.jpg"
    if not f.exists():
        req = urllib.request.Request(
            f"https://picsum.photos/seed/unisnap-{seed}/{W}/{H}.jpg", headers={"User-Agent": "unisnap-poc-seed"}
        )
        f.write_bytes(urllib.request.urlopen(req, timeout=30).read())
        time.sleep(0.3)
    return Image.open(io.BytesIO(f.read_bytes())).convert("RGB")


def exif_for(t: dt.datetime, ms: int = 0) -> bytes:
    stamp = t.strftime("%Y:%m:%d %H:%M:%S").encode()
    return piexif.dump({
        "0th": {piexif.ImageIFD.Make: b"UnisnapTest", piexif.ImageIFD.DateTime: stamp},
        "Exif": {
            piexif.ExifIFD.DateTimeOriginal: stamp,
            piexif.ExifIFD.DateTimeDigitized: stamp,
            piexif.ExifIFD.SubSecTimeOriginal: f"{ms:03d}".encode(),
        },
    })


def save(img: Image.Image, path: Path, t: dt.datetime, ms: int = 0, quality: int = 92) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, "JPEG", quality=quality, exif=exif_for(t, ms))


def log(name, kind, account, expected):
    key_rows.append({"file": name, "set": kind, "account": account, "expected": expected})


def at(day: int, minute_step: int, i: int) -> dt.datetime:
    return dt.datetime(2026, 10, day, 10, 0, 0) + dt.timedelta(seconds=90 * i * minute_step)


A, B = OUT / "A", OUT / "B"
for d in (A, B):
    d.mkdir(parents=True, exist_ok=True)

# 1) Exact copies: 20 files, byte-identical in both accounts.
for i in range(20):
    name = f"exact_{i + 1:02d}.jpg"
    save(fetch(f"ex{i + 1:02d}"), A / name, at(1, 1, i))
    shutil.copyfile(A / name, B / name)
    log(name, "exact", "A+B", "match by dedupKey (same file in both)")

# 2) Resized copies: A full size, B the same photo at 50% and re-saved as JPEG (EXIF kept).
for i in range(10):
    name = f"resized_{i + 1:02d}.jpg"
    t = at(2, 1, i)
    full = fetch(f"rs{i + 1:02d}")
    save(full, A / name, t)
    save(full.resize((W // 2, H // 2), Image.LANCZOS), B / name, t, quality=85)
    log(name, "resized", "A+B", "match by fingerprint (dedupKey differs)")

# 3) Look-alikes: same background, a 'subject' in different positions; A and B frames interleave in time.
bg = fetch("burst")
t0 = dt.datetime(2026, 10, 3, 11, 0, 0)


def frame(x: int) -> Image.Image:
    im = bg.copy()
    d = ImageDraw.Draw(im)
    d.ellipse([x - 90, 520, x + 90, 1000], fill=(200, 40, 40))  # body
    d.ellipse([x - 55, 380, x + 55, 500], fill=(240, 200, 160))  # head
    return im


for i in range(5):
    ms_a, ms_b = i * 300, i * 300 + 150
    save(frame(300 + i * 110), A / f"burst_a{i + 1}.jpg", t0 + dt.timedelta(milliseconds=ms_a), ms_a % 1000)
    save(frame(355 + i * 110), B / f"burst_b{i + 1}.jpg", t0 + dt.timedelta(milliseconds=ms_b), ms_b % 1000)
    log(f"burst_a{i + 1}.jpg", "lookalike", "A", "similar to B burst frames, never exact")
    log(f"burst_b{i + 1}.jpg", "lookalike", "B", "similar to A burst frames, never exact")

# 4) Unique: 15 different photos per account, on different days so nothing pairs.
for i in range(15):
    save(fetch(f"ua{i + 1:02d}"), A / f"unique_a{i + 1:02d}.jpg", at(4, 1, i))
    save(fetch(f"ub{i + 1:02d}"), B / f"unique_b{i + 1:02d}.jpg", at(5, 1, i))
    log(f"unique_a{i + 1:02d}.jpg", "unique", "A", "no match")
    log(f"unique_b{i + 1:02d}.jpg", "unique", "B", "no match")

with open(OUT / "ANSWER_KEY.csv", "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=["file", "set", "account", "expected"])
    w.writeheader()
    w.writerows(key_rows)

print("A:", len(list(A.glob("*.jpg"))), "files · B:", len(list(B.glob("*.jpg"))), "files")
