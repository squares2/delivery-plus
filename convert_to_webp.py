"""
Batch PNG → WebP converter
Usage: python convert_to_webp.py
Place this script inside your /items folder, or edit ITEMS_DIR below.
Requires: pip install Pillow
"""

from pathlib import Path
from PIL import Image
import sys

# ── Config ────────────────────────────────────────────────
ITEMS_DIR = Path(r"D:\Work\Delivo\delivo-project\items")   # same folder as script
QUALITY    = 85                       # 80–90 is sweet spot (quality vs size)
DELETE_PNG = False                    # set True to delete originals after converting
# ─────────────────────────────────────────────────────────

pngs = list(ITEMS_DIR.rglob("*.png"))
total = len(pngs)

if total == 0:
    print("No PNG files found.")
    sys.exit()

print(f"Found {total} PNG files. Converting...\n")

ok = 0
skipped = 0
errors = 0

for i, src in enumerate(pngs, 1):
    dst = src.with_suffix(".webp")

    if dst.exists():
        print(f"[{i}/{total}] SKIP (exists): {src.name}")
        skipped += 1
        continue

    try:
        with Image.open(src) as img:
            # Preserve RGBA (transparency) if present
            if img.mode in ("RGBA", "LA"):
                img.save(dst, "WEBP", quality=QUALITY, lossless=False)
            else:
                img = img.convert("RGB")
                img.save(dst, "WEBP", quality=QUALITY)

        old_kb = src.stat().st_size / 1024
        new_kb = dst.stat().st_size / 1024
        saved  = old_kb - new_kb
        pct    = (saved / old_kb * 100) if old_kb > 0 else 0
        print(f"[{i}/{total}] {src.name}  {old_kb:.0f}KB → {new_kb:.0f}KB  (-{pct:.0f}%)")

        if DELETE_PNG:
            src.unlink()

        ok += 1

    except Exception as e:
        print(f"[{i}/{total}] ERROR {src.name}: {e}")
        errors += 1

print(f"\n✅ Done: {ok} converted, {skipped} skipped, {errors} errors.")