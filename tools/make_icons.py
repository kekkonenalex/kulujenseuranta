"""The Kulta app icons (look A): Otso's bear drawn in vertical amber rays on true black.

    python tools/make_icons.py

Writes icons/icon.svg and the PNGs the manifest and iOS use (180, 192, 512, 512 maskable). Pillow only: the
bear's outline (Otso's own icon path) is sampled here, so no SVG renderer is needed.
"""

from __future__ import annotations

import re
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

HERE = Path(__file__).resolve().parents[1] / "icons"
HEAD = "M50 22c22 0 36 14 36 33 0 13-6 22-15 27l-7 4c-4 3-9 4-14 4s-10-1-14-4l-7-4C20 77 14 68 14 55c0-19 14-33 36-33z"
EARS = [(24, 26, 13), (76, 26, 13)]
NOSE = [(43, 62), (57, 62), (50, 70)]
AMBER, COPPER = (247, 194, 90), (217, 119, 47)


def outline(path: str, steps: int = 24) -> list[tuple[float, float]]:
    """Points along an SVG path made of M, c, s, l, C and z (enough for the bear's head)."""
    tokens = re.findall(r"[MmCcSsLlZz]|-?\d*\.?\d+", path)
    points, x, y, i, last_ctrl, cmd = [], 0.0, 0.0, 0, None, None

    def num():
        nonlocal i
        i += 1
        return float(tokens[i - 1])

    def cubic(p0, p1, p2, p3):
        for k in range(1, steps + 1):
            t = k / steps
            a = (1 - t) ** 3
            b = 3 * (1 - t) ** 2 * t
            c = 3 * (1 - t) * t ** 2
            d = t ** 3
            points.append((a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]))

    while i < len(tokens):
        if re.fullmatch(r"[A-Za-z]", tokens[i]):
            cmd = tokens[i]
            i += 1
            if cmd in "Zz":
                continue
        if cmd == "M":
            x, y = num(), num()
            points.append((x, y))
            cmd = "L"
        elif cmd in "Cc":
            rel = cmd == "c"
            x1, y1, x2, y2, x3, y3 = (num() for _ in range(6))
            if rel:
                x1, y1, x2, y2, x3, y3 = x + x1, y + y1, x + x2, y + y2, x + x3, y + y3
            cubic((x, y), (x1, y1), (x2, y2), (x3, y3))
            last_ctrl, x, y = (x2, y2), x3, y3
        elif cmd in "Ss":
            rel = cmd == "s"
            x2, y2, x3, y3 = (num() for _ in range(4))
            if rel:
                x2, y2, x3, y3 = x + x2, y + y2, x + x3, y + y3
            x1, y1 = (2 * x - last_ctrl[0], 2 * y - last_ctrl[1]) if last_ctrl else (x, y)
            cubic((x, y), (x1, y1), (x2, y2), (x3, y3))
            last_ctrl, x, y = (x2, y2), x3, y3
        elif cmd in "Ll":
            dx, dy = num(), num()
            x, y = (x + dx, y + dy) if cmd == "l" else (dx, dy)
            points.append((x, y))
            last_ctrl = None
    return points


def draw(size: int, rounded: bool, inset: float) -> Image.Image:
    """The icon at `size`. `inset`: the bear's share of the square (smaller for the maskable safe zone)."""
    scale = 4  # drawn large and shrunk: smooth edges
    big = size * scale
    image = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    ImageDraw.Draw(image).rounded_rectangle([0, 0, big - 1, big - 1], radius=int(big * 0.22) if rounded else 0,
                                            fill=(0, 0, 0, 255))
    unit = big * inset / 100 / 100  # bear units (0-100) to pixels: the bear takes `inset`% of the square
    off = (big - 100 * unit) / 2
    to_px = lambda p: (off + p[0] * unit, off + p[1] * unit + unit * 2)  # noqa: E731 (a little lower: optical centre)

    mask = Image.new("L", (big, big), 0)
    shape = ImageDraw.Draw(mask)
    shape.polygon([to_px(p) for p in outline(HEAD)], fill=255)
    for cx, cy, r in EARS:
        x, y = to_px((cx, cy))
        shape.ellipse([x - r * unit, y - r * unit, x + r * unit, y + r * unit], fill=255)

    # The rays: full-height stripes, cut to the bear, amber into copper and fading a little downwards.
    stripes = Image.new("L", (big, big), 0)
    paint = ImageDraw.Draw(stripes)
    step, width = 5 * unit, 2.6 * unit
    left = to_px((10, 0))[0]
    for n in range(17):
        x0 = left + n * step
        paint.rectangle([x0, 0, x0 + width, big], fill=255)
    top, bottom = to_px((0, 12))[1], to_px((0, 90))[1]
    colour = Image.new("RGB", (1, big))
    fade = Image.new("L", (1, big))
    for row in range(big):
        t = min(1.0, max(0.0, (row - top) / (bottom - top)))
        colour.putpixel((0, row), tuple(round(AMBER[k] + (COPPER[k] - AMBER[k]) * t) for k in range(3)))
        fade.putpixel((0, row), round(255 * (1 - 0.45 * t)))
    colour, fade = colour.resize((big, big)), fade.resize((big, big))
    alpha = ImageChops.multiply(ImageChops.multiply(stripes, mask), fade)
    bear = colour.convert("RGBA")
    bear.putalpha(alpha)
    image.alpha_composite(bear)
    ImageDraw.Draw(image).polygon([to_px(p) for p in NOSE], fill=(0, 0, 0, 255))
    return image.resize((size, size), Image.LANCZOS)


SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <defs>
    <clipPath id="bear"><circle cx="24" cy="26" r="13"/><circle cx="76" cy="26" r="13"/>
      <path d="{head}"/></clipPath>
    <linearGradient id="ray" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#F7C25A"/><stop offset="1" stop-color="#D9772F" stop-opacity=".55"/>
    </linearGradient>
  </defs>
  <rect width="100" height="100" rx="22" fill="#000"/>
  <g transform="translate(9 9) scale(.82)">
    <g clip-path="url(#bear)" fill="url(#ray)">{rays}</g>
    <path d="M43 62h14l-7 8z" fill="#000"/>
  </g>
</svg>
"""


def main() -> None:
    HERE.mkdir(exist_ok=True)
    rays = "".join(f'<rect x="{x}" width="2.4" height="100"/>' for x in range(10, 90, 5))
    (HERE / "icon.svg").write_text(SVG.format(head=HEAD, rays=rays), encoding="utf-8")
    draw(180, rounded=False, inset=82).convert("RGB").save(HERE / "icon-180.png")  # (iOS rounds it itself)
    draw(192, rounded=True, inset=82).save(HERE / "icon-192.png")
    draw(512, rounded=True, inset=82).save(HERE / "icon-512.png")
    draw(512, rounded=False, inset=64).convert("RGB").save(HERE / "icon-512-maskable.png")  # (the safe zone)
    print("icons written")


if __name__ == "__main__":
    main()
