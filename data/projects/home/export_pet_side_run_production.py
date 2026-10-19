from __future__ import annotations

import json
from pathlib import Path

from PIL import Image


SOURCE = Path("/root/ayan/bridge/public/made/cat-rabbit-locomotion-atlas-v1.png")
OUTPUT_DIR = Path("/root/ayan/bridge/public/made/pet-assets/side-run-v1")
ATLAS_OUTPUT = Path("/root/ayan/bridge/public/made/cat-rabbit-side-run-atlas-v1.png")
MANIFEST_OUTPUT = Path("/root/ayan/bridge/public/made/cat-rabbit-side-run-manifest-v1.json")

SOURCE_CELL_W = 430
SOURCE_CELL_H = 362
FRAME_SIZE = 448
SAFE_PAD = 10
CONTENT_SIZE = FRAME_SIZE - SAFE_PAD * 2
GROUND_Y = SAFE_PAD + CONTENT_SIZE
FRAME_COUNT = 6

# The source study placed the complete cat cycle 72 px above the row bottom.
# Moving every cat frame by the same amount keeps its original bobbing while
# making the shared bottom-center anchor represent the actual contact plane.
ROW_OFFSETS = {"rabbit": 0, "cat": 72}


def resize_premultiplied(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    """Resize transparent art without introducing dark RGB fringes."""
    premultiplied = image.convert("RGBa")
    resized = premultiplied.resize(size, Image.Resampling.LANCZOS)
    return resized.convert("RGBA")


def source_frame(atlas: Image.Image, row: int, index: int) -> Image.Image:
    return atlas.crop(
        (
            index * SOURCE_CELL_W,
            row * SOURCE_CELL_H,
            (index + 1) * SOURCE_CELL_W,
            (row + 1) * SOURCE_CELL_H,
        )
    )


def normalize_frame(frame: Image.Image, y_offset: int) -> Image.Image:
    shifted = Image.new("RGBA", frame.size, (0, 0, 0, 0))
    shifted.alpha_composite(frame, (0, y_offset))
    scaled = resize_premultiplied(shifted, (CONTENT_SIZE, CONTENT_SIZE))
    output = Image.new("RGBA", (FRAME_SIZE, FRAME_SIZE), (0, 0, 0, 0))
    output.alpha_composite(scaled, (SAFE_PAD, SAFE_PAD))
    return output


def main() -> None:
    atlas = Image.open(SOURCE).convert("RGBA")
    expected = (SOURCE_CELL_W * FRAME_COUNT, SOURCE_CELL_H * 2)
    if atlas.size != expected:
        raise SystemExit(f"unexpected atlas size: {atlas.size}, expected {expected}")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    production_atlas = Image.new(
        "RGBA", (FRAME_SIZE * FRAME_COUNT, FRAME_SIZE * 2), (0, 0, 0, 0)
    )
    frames_manifest: dict[str, list[dict[str, object]]] = {"rabbit": [], "cat": []}

    for row, pet in enumerate(("rabbit", "cat")):
        for index in range(FRAME_COUNT):
            normalized = normalize_frame(
                source_frame(atlas, row, index), ROW_OFFSETS[pet]
            )
            filename = f"{pet}-side-run-{index + 1:02d}.png"
            path = OUTPUT_DIR / filename
            normalized.save(path, optimize=True)
            production_atlas.alpha_composite(
                normalized, (index * FRAME_SIZE, row * FRAME_SIZE)
            )
            alpha_bbox = normalized.getchannel("A").getbbox()
            frames_manifest[pet].append(
                {
                    "index": index,
                    "file": f"pet-assets/side-run-v1/{filename}",
                    "alpha_bbox": list(alpha_bbox) if alpha_bbox else None,
                }
            )

    production_atlas.save(ATLAS_OUTPUT, optimize=True)
    manifest = {
        "version": 1,
        "motion": "side_run_right",
        "frame_count": FRAME_COUNT,
        "frame_size": [FRAME_SIZE, FRAME_SIZE],
        "anchor": [FRAME_SIZE // 2, GROUND_Y],
        "atlas": ATLAS_OUTPUT.name,
        "rows": {"rabbit": 0, "cat": 1},
        "direction": "right",
        "left_facing": "mirror_x",
        "frames": frames_manifest,
        "source": SOURCE.name,
        "notes": [
            "Rabbit airborne height and cat body bobbing are preserved across the cycle.",
            "Cat frames share one constant vertical correction; frames are never fitted individually.",
            "Ten transparent pixels surround the approved motion art for safe filtering.",
        ],
    }
    MANIFEST_OUTPUT.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"saved {ATLAS_OUTPUT} {production_atlas.size} {production_atlas.mode}")
    print(f"saved {MANIFEST_OUTPUT}")
    print(f"saved {FRAME_COUNT * 2} frames under {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
