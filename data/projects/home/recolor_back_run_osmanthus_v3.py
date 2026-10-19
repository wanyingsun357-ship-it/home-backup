from __future__ import annotations

import json
import shutil
from pathlib import Path

from PIL import Image, ImageChops

from recolor_front_run_osmanthus_v3 import assert_same_alpha, recolor


MADE = Path("/root/ayan/bridge/public/made")
SOURCE_SHEET = MADE / "cat-rabbit-back-locomotion-study-v2.png"
OUTPUT_SHEET = MADE / "cat-rabbit-back-locomotion-study-v3-color.png"
SOURCE_DIR = MADE / "pet-assets/back-run-v2"
OUTPUT_DIR = MADE / "pet-assets/back-run-v3"
SOURCE_MANIFEST = MADE / "cat-rabbit-back-run-manifest-v2.json"
OUTPUT_MANIFEST = MADE / "cat-rabbit-back-run-manifest-v3.json"
OUTPUT_ATLAS = MADE / "cat-rabbit-back-run-atlas-v3.png"

FRAME_SIZE = 448
FRAME_COUNT = 6


def main() -> None:
    source_sheet = Image.open(SOURCE_SHEET).convert("RGBA")
    output_sheet = recolor(source_sheet, max_y=source_sheet.height // 2)
    assert_same_alpha(source_sheet, output_sheet, OUTPUT_SHEET.name)
    if ImageChops.difference(
        source_sheet.crop((0, source_sheet.height // 2, *source_sheet.size)),
        output_sheet.crop((0, output_sheet.height // 2, *output_sheet.size)),
    ).getbbox() is not None:
        raise SystemExit("cat row changed in color sheet")
    output_sheet.save(OUTPUT_SHEET, optimize=True)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    atlas = Image.new(
        "RGBA", (FRAME_SIZE * FRAME_COUNT, FRAME_SIZE * 2), (0, 0, 0, 0)
    )
    for index in range(FRAME_COUNT):
        rabbit_name = f"rabbit-back-run-{index + 1:02d}.png"
        rabbit_source = Image.open(SOURCE_DIR / rabbit_name).convert("RGBA")
        rabbit_output = recolor(rabbit_source)
        assert_same_alpha(rabbit_source, rabbit_output, rabbit_name)
        rabbit_output.save(OUTPUT_DIR / rabbit_name, optimize=True)
        atlas.alpha_composite(rabbit_output, (index * FRAME_SIZE, 0))

        cat_name = f"cat-back-run-{index + 1:02d}.png"
        shutil.copy2(SOURCE_DIR / cat_name, OUTPUT_DIR / cat_name)
        cat = Image.open(OUTPUT_DIR / cat_name).convert("RGBA")
        atlas.alpha_composite(cat, (index * FRAME_SIZE, FRAME_SIZE))

    atlas.save(OUTPUT_ATLAS, optimize=True)

    manifest = json.loads(SOURCE_MANIFEST.read_text(encoding="utf-8"))
    manifest["version"] = 3
    manifest["atlas"] = OUTPUT_ATLAS.name
    manifest["source"] = OUTPUT_SHEET.name
    for pet in ("rabbit", "cat"):
        for frame in manifest["frames"][pet]:
            frame["file"] = frame["file"].replace("back-run-v2", "back-run-v3")
    manifest["notes"].append(
        "Rabbit RGB uses the approved pale osmanthus-milk mapping; alpha, frame geometry, and anchor are unchanged from v2."
    )
    manifest["notes"].append("Cat frame files are exact copies of v2.")
    OUTPUT_MANIFEST.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    print(f"saved {OUTPUT_SHEET}")
    print(f"saved {OUTPUT_ATLAS}")
    print(f"saved {OUTPUT_MANIFEST}")
    print(f"saved 12 frames under {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
