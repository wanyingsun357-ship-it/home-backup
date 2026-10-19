from __future__ import annotations

import colorsys
import json
import shutil
from pathlib import Path

from PIL import Image, ImageChops


MADE = Path("/root/ayan/bridge/public/made")
SOURCE_SHEET = MADE / "cat-rabbit-front-locomotion-study-v2.png"
OUTPUT_SHEET = MADE / "cat-rabbit-front-locomotion-study-v3-color.png"
SOURCE_DIR = MADE / "pet-assets/front-run-v2"
OUTPUT_DIR = MADE / "pet-assets/front-run-v3"
SOURCE_MANIFEST = MADE / "cat-rabbit-front-run-manifest-v2.json"
OUTPUT_MANIFEST = MADE / "cat-rabbit-front-run-manifest-v3.json"
OUTPUT_ATLAS = MADE / "cat-rabbit-front-run-atlas-v3.png"

FRAME_SIZE = 448
FRAME_COUNT = 6


def recolor_pixel(r: int, g: int, b: int, a: int) -> tuple[int, int, int, int]:
    if a == 0:
        return r, g, b, a
    hue, saturation, value = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
    if not (0.0 <= hue <= 0.12 and 0.025 <= saturation <= 0.38 and value >= 0.66):
        return r, g, b, a

    amount = max(0.0, min(1.0, (value - 0.66) / 0.34))
    new_hue = hue + (0.068 - hue) * (0.62 * amount)
    new_saturation = saturation * (0.78 - 0.24 * amount)
    new_value = value + (1.0 - value) * (0.24 + 0.25 * amount)
    red, green, blue = colorsys.hsv_to_rgb(
        new_hue, new_saturation, min(1.0, new_value)
    )
    return round(red * 255), round(green * 255), round(blue * 255), a


def recolor(image: Image.Image, max_y: int | None = None) -> Image.Image:
    source = image.convert("RGBA")
    width, height = source.size
    limit = height if max_y is None else max_y
    pixels = list(source.getdata())
    output: list[tuple[int, int, int, int]] = []
    for index, pixel in enumerate(pixels):
        output.append(recolor_pixel(*pixel) if index // width < limit else pixel)
    result = Image.new("RGBA", source.size)
    result.putdata(output)
    return result


def assert_same_alpha(before: Image.Image, after: Image.Image, label: str) -> None:
    difference = ImageChops.difference(before.getchannel("A"), after.getchannel("A"))
    if difference.getbbox() is not None:
        raise SystemExit(f"alpha changed: {label}")


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
        rabbit_name = f"rabbit-front-run-{index + 1:02d}.png"
        rabbit_source = Image.open(SOURCE_DIR / rabbit_name).convert("RGBA")
        rabbit_output = recolor(rabbit_source)
        assert_same_alpha(rabbit_source, rabbit_output, rabbit_name)
        rabbit_output.save(OUTPUT_DIR / rabbit_name, optimize=True)
        atlas.alpha_composite(rabbit_output, (index * FRAME_SIZE, 0))

        cat_name = f"cat-front-run-{index + 1:02d}.png"
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
            frame["file"] = frame["file"].replace("front-run-v2", "front-run-v3")
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
