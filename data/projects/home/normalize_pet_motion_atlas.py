from pathlib import Path

from collections import deque

from PIL import Image, ImageFilter


SOURCE = Path("/root/ayan/bridge/public/made/cat-rabbit-locomotion-study-v2.png")
OUTPUT = Path("/root/ayan/bridge/public/made/cat-rabbit-locomotion-atlas-v1.png")

# The generated study is visually arranged as six poses per row, but the poses
# are not laid out on an exact grid. These hand-checked boundaries fall in the
# transparent gaps between poses so a neighboring ear, paw, tail, or wind mark
# cannot leak into the current frame.
ROW_BOUNDS = {
    "rabbit": [0, 352, 675, 1008, 1402, 1754, 2171],
    "cat": [0, 352, 700, 1118, 1440, 1786, 2171],
}

CELL_W = 430


def keep_largest_subject(crop: Image.Image) -> Image.Image:
    """Remove detached wind/footprint/neighbor fragments from one pose crop."""
    alpha = crop.getchannel("A")
    # A small dilation connects antialiased whiskers, pendant edges, and toes to
    # the animal while leaving distant speed marks and neighboring fragments
    # separate.
    connected_mask = alpha.point(lambda value: 255 if value > 8 else 0).filter(ImageFilter.MaxFilter(5))
    pixels = connected_mask.load()
    width, height = crop.size
    seen = bytearray(width * height)
    largest: list[int] = []

    for y in range(height):
        for x in range(width):
            start = y * width + x
            if seen[start] or pixels[x, y] == 0:
                continue
            queue = deque([(x, y)])
            seen[start] = 1
            component: list[int] = []
            while queue:
                cx, cy = queue.popleft()
                component.append(cy * width + cx)
                for nx, ny in ((cx - 1, cy), (cx + 1, cy), (cx, cy - 1), (cx, cy + 1)):
                    if nx < 0 or ny < 0 or nx >= width or ny >= height:
                        continue
                    index = ny * width + nx
                    if not seen[index] and pixels[nx, ny] != 0:
                        seen[index] = 1
                        queue.append((nx, ny))
            if len(component) > len(largest):
                largest = component

    keep = bytearray(width * height)
    for index in largest:
        keep[index] = 1
    original_alpha = list(alpha.getdata())
    cleaned_alpha = Image.new("L", crop.size)
    cleaned_alpha.putdata([value if keep[index] else 0 for index, value in enumerate(original_alpha)])
    cleaned = crop.copy()
    cleaned.putalpha(cleaned_alpha)
    return cleaned


def normalize_row(source: Image.Image, y0: int, y1: int, bounds: list[int]) -> list[Image.Image]:
    row_height = y1 - y0
    frames: list[Image.Image] = []
    for left, right in zip(bounds, bounds[1:]):
        crop = keep_largest_subject(source.crop((left, y0, right, y1)))
        frame = Image.new("RGBA", (CELL_W, row_height), (0, 0, 0, 0))
        frame.alpha_composite(crop, ((CELL_W - crop.width) // 2, 0))
        frames.append(frame)
    return frames


def main() -> None:
    source = Image.open(SOURCE).convert("RGBA")
    width, height = source.size
    if (width, height) != (2171, 724):
        raise SystemExit(f"unexpected source size: {width}x{height}")

    half = height // 2
    rabbit = normalize_row(source, 0, half, ROW_BOUNDS["rabbit"])
    cat = normalize_row(source, half, height, ROW_BOUNDS["cat"])
    atlas = Image.new("RGBA", (CELL_W * 6, height), (0, 0, 0, 0))

    for index, frame in enumerate(rabbit):
        atlas.alpha_composite(frame, (index * CELL_W, 0))
    for index, frame in enumerate(cat):
        atlas.alpha_composite(frame, (index * CELL_W, half))

    atlas.save(OUTPUT, optimize=True)
    print(f"saved {OUTPUT} {atlas.width}x{atlas.height} {atlas.mode}")


if __name__ == "__main__":
    main()
