"""Stress-test seed: 1000 photos per account, generated procedurally (smooth random scenes, ~40 KB each).

Mix per account: 150 exact copies, 100 resized copies, 50 same-account pairs, 10 bursts x 4 frames,
a 40-photo same-second flood of unrelated photos, and 570 unique photos.
Output: <out>/A, <out>/B and ANSWER_KEY_stress.csv. Capture times go into EXIF.
Run:  python -I scripts/make_seed_stress.py <output_dir>
"""
import csv
import datetime as dt
import random
import shutil
import sys
from pathlib import Path

import piexif
from PIL import Image, ImageDraw, ImageFilter

OUT = Path(sys.argv[1])
A, B = OUT / "A", OUT / "B"
A.mkdir(parents=True, exist_ok=True)
B.mkdir(parents=True, exist_ok=True)
rows = []
START = dt.datetime(2023, 1, 1, 8, 0, 0)
slot = 0  # every designed group gets its own time slot, two hours apart


def next_time() -> dt.datetime:
    global slot
    slot += 1
    return START + dt.timedelta(hours=2 * slot)


def scene(seed: str, portrait: bool = False) -> Image.Image:
    """A smooth random 'photo' at working size (400x300 or 300x400). Different seeds look clearly different."""
    r = random.Random(seed)
    w, h = (300, 400) if portrait else (400, 300)
    cols, rws = r.randint(3, 6), r.randint(3, 6)
    grid = Image.new("RGB", (cols, rws))
    for x in range(cols):
        for y in range(rws):
            grid.putpixel((x, y), (r.randint(0, 255), r.randint(0, 255), r.randint(0, 255)))
    im = grid.resize((w, h), Image.BICUBIC)
    d = ImageDraw.Draw(im)
    for _ in range(r.randint(2, 5)):
        x0, y0 = r.randint(0, w - 60), r.randint(0, h - 60)
        box = [x0, y0, x0 + r.randint(40, w // 2), y0 + r.randint(40, h // 2)]
        col = (r.randint(0, 255), r.randint(0, 255), r.randint(0, 255))
        (d.ellipse if r.random() < 0.5 else d.rectangle)(box, fill=col)
    return im.filter(ImageFilter.GaussianBlur(r.uniform(2, 6)))


def big(im: Image.Image, scale: int = 4) -> Image.Image:
    return im.resize((im.width * scale, im.height * scale), Image.BICUBIC)


def exif_for(t: dt.datetime, ms: int = 0) -> bytes:
    stamp = t.strftime("%Y:%m:%d %H:%M:%S").encode()
    return piexif.dump({
        "0th": {piexif.ImageIFD.Make: b"UnisnapStress", piexif.ImageIFD.DateTime: stamp},
        "Exif": {piexif.ExifIFD.DateTimeOriginal: stamp, piexif.ExifIFD.DateTimeDigitized: stamp, piexif.ExifIFD.SubSecTimeOriginal: f"{ms:03d}".encode()},
    })


def save(im: Image.Image, path: Path, t: dt.datetime, ms: int = 0, quality: int = 85) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, "JPEG", quality=quality, exif=exif_for(t, ms))


def portrait(seed: str) -> bool:
    return random.Random("p" + seed).random() < 0.2  # about 20% portrait


def log(files, account, expected):
    rows.append((files, account, expected))


# 1) exact copies: byte-identical in both accounts
for i in range(150):
    name, t, s = f"exact_{i + 1:04d}.jpg", next_time(), f"ex{i}"
    save(big(scene(s, portrait(s))), A / name, t)
    shutil.copyfile(A / name, B / name)
    log(name, "A+B", "Exact group across accounts")

# 2) resized copies: A full size, B half size re-saved (same capture time)
for i in range(100):
    name, t, s = f"resized_{i + 1:03d}.jpg", next_time(), f"rs{i}"
    full = big(scene(s, portrait(s)))
    save(full, A / name, t)
    save(full.resize((full.width // 2, full.height // 2), Image.LANCZOS), B / name, t, quality=80)
    log(name, "A+B", "Similar group across accounts")

# 3) same-account copies: original plus a smaller re-saved copy, both in ONE account
for acct, folder in (("A", A), ("B", B)):
    for i in range(50):
        t, s = next_time(), f"in{acct}{i}"
        full = big(scene(s, portrait(s)))
        save(full, folder / f"in{acct}_{i + 1:03d}_full.jpg", t)
        save(full.resize((full.width // 2, full.height // 2), Image.LANCZOS), folder / f"in{acct}_{i + 1:03d}_copy.jpg", t, quality=80)
        log(f"in{acct}_{i + 1:03d}_full/_copy", acct, f"Similar group inside account {acct}")

# 4) bursts: 4 frames of the same scene with a moving subject, 300 ms apart
for acct, folder in (("A", A), ("B", B)):
    for b in range(10):
        t0, s = next_time(), f"burst{acct}{b}"
        base = scene(s)
        for f in range(4):
            im = base.copy()
            d = ImageDraw.Draw(im)
            x = 80 + f * 70
            d.ellipse([x - 22, 130, x + 22, 250], fill=(200, 40, 40))
            d.ellipse([x - 13, 95, x + 13, 125], fill=(240, 200, 160))
            ms = f * 300
            save(big(im), folder / f"burst_{acct}{b + 1:02d}_f{f + 1}.jpg", t0 + dt.timedelta(seconds=ms // 1000), ms % 1000)
        log(f"burst_{acct}{b + 1:02d}_f1..f4", acct, f"Burst group inside account {acct}")

# 5) same-second flood: 40 unrelated landscape photos per account sharing one capture time
flood_t = next_time()
for acct, folder in (("A", A), ("B", B)):
    for i in range(40):
        save(big(scene(f"flood{acct}{i}")), folder / f"flood_{acct}_{i + 1:02d}.jpg", flood_t)
        log(f"flood_{acct}_{i + 1:02d}.jpg", acct, "No group (unrelated photos with the same timestamp)")

# 6) unique photos: top up each account to 1000 files
for acct, folder in (("A", A), ("B", B)):
    have = len(list(folder.glob("*.jpg")))
    for i in range(1000 - have):
        s = f"u{acct}{i}"
        save(big(scene(s, portrait(s))), folder / f"uniq_{acct}_{i + 1:04d}.jpg", next_time())
        log(f"uniq_{acct}_{i + 1:04d}.jpg", acct, "No group")

with open(OUT / "ANSWER_KEY_stress.csv", "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["files", "account", "expected"])
    w.writerows(rows)
print("A:", len(list(A.glob("*.jpg"))), "files · B:", len(list(B.glob("*.jpg"))), "files")
