#!/usr/bin/env python3
"""Generate the app icons as PNGs using only the Python standard library.

Run from the project root:  python3 icons/generate_icons.py
"""
import struct
import zlib
from pathlib import Path

BACKGROUND = (0, 0, 0)
DISC = (61, 220, 151)  # matches --accent in styles.css
ARROW = (0, 0, 0)
SAMPLES = 3  # sub-samples per axis, for anti-aliased edges

# Navigation arrow in disc-relative coordinates (disc centre 0,0; disc radius 1).
ARROW_POINTS = [(0.0, -0.62), (0.5, 0.55), (0.0, 0.3), (-0.5, 0.55)]

# (file name, size in px, disc radius as a fraction of size).
# The maskable icon keeps the disc inside the central 80% safe zone.
ICONS = [
    ("icon-180.png", 180, 0.40),
    ("icon-192.png", 192, 0.40),
    ("icon-512.png", 512, 0.40),
    ("icon-maskable-512.png", 512, 0.32),
]


def inside_polygon(x, y, points):
    inside = False
    j = len(points) - 1
    for i, (xi, yi) in enumerate(points):
        xj, yj = points[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def pixel_colour(px, py, centre, radius):
    disc_hits = arrow_hits = 0
    for sy in range(SAMPLES):
        for sx in range(SAMPLES):
            x = (px + (sx + 0.5) / SAMPLES - centre) / radius
            y = (py + (sy + 0.5) / SAMPLES - centre) / radius
            if x * x + y * y > 1:
                continue
            if inside_polygon(x, y, ARROW_POINTS):
                arrow_hits += 1
            else:
                disc_hits += 1
    total = SAMPLES * SAMPLES
    background_hits = total - disc_hits - arrow_hits
    return bytes(
        round((background_hits * b + disc_hits * d + arrow_hits * a) / total)
        for b, d, a in zip(BACKGROUND, DISC, ARROW)
    )


def render(size, disc_fraction):
    centre = size / 2
    radius = size * disc_fraction
    rows = []
    for py in range(size):
        row = bytearray(b"\x00")  # PNG filter type: none
        for px in range(size):
            row += pixel_colour(px, py, centre, radius)
        rows.append(bytes(row))
    return b"".join(rows)


def png_chunk(tag, data):
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)


def encode_png(size, raw_rgb):
    header = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)  # 8-bit RGB
    return (
        b"\x89PNG\r\n\x1a\n"
        + png_chunk(b"IHDR", header)
        + png_chunk(b"IDAT", zlib.compress(raw_rgb, 9))
        + png_chunk(b"IEND", b"")
    )


def main():
    out_dir = Path(__file__).resolve().parent
    for name, size, disc_fraction in ICONS:
        (out_dir / name).write_bytes(encode_png(size, render(size, disc_fraction)))
        print(f"wrote icons/{name}")


if __name__ == "__main__":
    main()
