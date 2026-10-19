from __future__ import annotations

import json
from collections import deque
from pathlib import Path

from PIL import Image, ImageFilter


SOURCE = Path("/root/ayan/bridge/public/made/cat-rabbit-front-locomotion-study-v2.png")
OUTPUT_DIR = Path("/root/ayan/bridge/public/made/pet-assets/front-run-v2")
ATLAS_OUTPUT = Path("/root/ayan/bridge/public/made/cat-rabbit-front-run-atlas-v2.png")
MANIFEST_OUTPUT = Path("/root/ayan/bridge/public/made/cat-rabbit-front-run-manifest-v2.json")

SOURCE_W = 2172
SOURCE_H = 724
SOURCE_ROW_H = 362
NOMINAL_CELL_W = 362
WORK_CELL_W = 430
FRAME_SIZE = 448
SAFE_PAD = 10
CONTENT_SIZE = FRAME_SIZE - SAFE_PAD * 2
GROUND_Y = SAFE_PAD + CONTENT_SIZE
FRAME_COUNT = 6
ALPHA_THRESHOLD = 12

# The generated animals cross the visual midpoint between rows: one rabbit paw
# reaches 3 px below it, while several cat tails reach 12 px above it. These
# hand-checked 362 px windows include both edges without changing frame scale.
ROW_Y_BOUNDS = {"rabbit": (3, 365), "cat": (350, 712)}

# Preserve all within-cycle vertical motion. The cat window starts 12 px above
# the old midpoint, so a single 5 px correction places its lowest contact pose
# on the shared baseline. Frames are never fitted independently.
ROW_OFFSETS = {"rabbit": 0, "cat": 5}


def resize_premultiplied(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    premultiplied = image.convert("RGBa")
    resized = premultiplied.resize(size, Image.Resampling.LANCZOS)
    return resized.convert("RGBA")


def main_components(row: Image.Image) -> list[set[int]]:
    alpha = row.getchannel("A").point(
        lambda value: 255 if value > ALPHA_THRESHOLD else 0
    )
    pixels = alpha.load()
    width, height = row.size
    seen = bytearray(width * height)
    components: list[set[int]] = []

    for y in range(height):
        for x in range(width):
            start = y * width + x
            if seen[start] or pixels[x, y] == 0:
                continue
            queue = deque([(x, y)])
            seen[start] = 1
            component: set[int] = set()
            while queue:
                cx, cy = queue.popleft()
                component.add(cy * width + cx)
                for nx, ny in (
                    (cx - 1, cy),
                    (cx + 1, cy),
                    (cx, cy - 1),
                    (cx, cy + 1),
                ):
                    if nx < 0 or ny < 0 or nx >= width or ny >= height:
                        continue
                    index = ny * width + nx
                    if not seen[index] and pixels[nx, ny] != 0:
                        seen[index] = 1
                        queue.append((nx, ny))
            components.append(component)

    largest = sorted(components, key=len, reverse=True)[:FRAME_COUNT]
    if len(largest) != FRAME_COUNT:
        raise SystemExit(f"expected {FRAME_COUNT} subjects, found {len(largest)}")
    return sorted(largest, key=lambda component: min(index % width for index in component))


def isolate_component(row: Image.Image, component: set[int]) -> Image.Image:
    width, height = row.size
    core = Image.new("L", row.size, 0)
    core_pixels = core.load()
    for index in component:
        core_pixels[index % width, index // width] = 255
    # Restore antialiased edge pixels that belong to this subject while keeping
    # neighboring animals and detached generation specks out.
    keep = core.filter(ImageFilter.MaxFilter(7))
    original_alpha = row.getchannel("A")
    cleaned_alpha = Image.new("L", row.size, 0)
    cleaned_alpha_pixels = cleaned_alpha.load()
    keep_pixels = keep.load()
    alpha_pixels = original_alpha.load()
    for y in range(height):
        for x in range(width):
            if keep_pixels[x, y]:
                cleaned_alpha_pixels[x, y] = alpha_pixels[x, y]
    isolated = row.copy()
    isolated.putalpha(cleaned_alpha)
    return isolated


def extract_work_cell(subject: Image.Image, index: int) -> Image.Image:
    center_x = int((index + 0.5) * NOMINAL_CELL_W)
    left = center_x - WORK_CELL_W // 2
    cell = Image.new("RGBA", (WORK_CELL_W, SOURCE_ROW_H), (0, 0, 0, 0))
    source_left = max(0, left)
    source_right = min(SOURCE_W, left + WORK_CELL_W)
    crop = subject.crop((source_left, 0, source_right, SOURCE_ROW_H))
    cell.alpha_composite(crop, (source_left - left, 0))
    return cell


def normalize_frame(frame: Image.Image, y_offset: int) -> Image.Image:
    shifted = Image.new("RGBA", frame.size, (0, 0, 0, 0))
    shifted.alpha_composite(frame, (0, y_offset))
    scaled = resize_premultiplied(shifted, (CONTENT_SIZE, CONTENT_SIZE))
    output = Image.new("RGBA", (FRAME_SIZE, FRAME_SIZE), (0, 0, 0, 0))
    output.alpha_composite(scaled, (SAFE_PAD, SAFE_PAD))
    return output


def main() -> None:
    source = Image.open(SOURCE).convert("RGBA")
    if source.size != (SOURCE_W, SOURCE_H):
        raise SystemExit(f"unexpected source size: {source.size}")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    atlas = Image.new(
        "RGBA", (FRAME_SIZE * FRAME_COUNT, FRAME_SIZE * 2), (0, 0, 0, 0)
    )
    frames_manifest: dict[str, list[dict[str, object]]] = {"rabbit": [], "cat": []}

    for row_index, pet in enumerate(("rabbit", "cat")):
        y0, y1 = ROW_Y_BOUNDS[pet]
        row = source.crop((0, y0, SOURCE_W, y1))
        components = main_components(row)
        for index, component in enumerate(components):
            subject = isolate_component(row, component)
            normalized = normalize_frame(
                extract_work_cell(subject, index), ROW_OFFSETS[pet]
            )
            filename = f"{pet}-front-run-{index + 1:02d}.png"
            path = OUTPUT_DIR / filename
            normalized.save(path, optimize=True)
            atlas.alpha_composite(normalized, (index * FRAME_SIZE, row_index * FRAME_SIZE))
            bbox = normalized.getchannel("A").getbbox()
            frames_manifest[pet].append(
                {
                    "index": index,
                    "file": f"pet-assets/front-run-v2/{filename}",
                    "alpha_bbox": list(bbox) if bbox else None,
                }
            )

    atlas.save(ATLAS_OUTPUT, optimize=True)
    manifest = {
        "version": 2,
        "motion": "front_run_toward_viewer",
        "frame_count": FRAME_COUNT,
        "frame_size": [FRAME_SIZE, FRAME_SIZE],
        "anchor": [FRAME_SIZE // 2, GROUND_Y],
        "atlas": ATLAS_OUTPUT.name,
        "rows": {"rabbit": 0, "cat": 1},
        "direction": "down",
        "frames": frames_manifest,
        "source": SOURCE.name,
        "notes": [
            "Subjects are isolated by connected alpha components; frames are not mechanically sliced.",
            "Rabbit airborne height and cat body bobbing are preserved across the cycle.",
            "Cat frames share one constant vertical correction; frames are never fitted individually.",
        ],
    }
    MANIFEST_OUTPUT.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"saved {ATLAS_OUTPUT} {atlas.size} {atlas.mode}")
    print(f"saved {MANIFEST_OUTPUT}")
    print(f"saved {FRAME_COUNT * 2} frames under {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
