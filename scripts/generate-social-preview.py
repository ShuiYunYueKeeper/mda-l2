#!/usr/bin/env python3
"""Generate site/assets/og.png (1280x640) for link previews.

Run:  python scripts/generate-social-preview.py
Deps: Pillow. Fonts: Microsoft YaHei on Windows, common CJK fallbacks elsewhere.
"""
from __future__ import annotations

import os
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "site" / "assets" / "og.png"
SHOT = ROOT / "site" / "assets" / "screenshot-preview.png"
W, H = 1280, 640

FONT_CANDIDATES = [
    ("C:/Windows/Fonts/msyhbd.ttc", "C:/Windows/Fonts/msyh.ttc"),
    ("/System/Library/Fonts/PingFang.ttc", "/System/Library/Fonts/PingFang.ttc"),
    ("/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc", "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"),
]


def load_fonts(bold_size: int, regular_size: int) -> tuple[ImageFont.FreeTypeFont, ImageFont.FreeTypeFont]:
    for bold_path, regular_path in FONT_CANDIDATES:
        if os.path.exists(bold_path) and os.path.exists(regular_path):
            return (
                ImageFont.truetype(bold_path, bold_size),
                ImageFont.truetype(regular_path, regular_size),
            )
    raise SystemExit("No CJK font found; install Microsoft YaHei or Noto Sans CJK.")


def rounded_mask(size: tuple[int, int], radius: int) -> Image.Image:
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size[0] - 1, size[1] - 1), radius=radius, fill=255)
    return mask


def make_background() -> Image.Image:
    img = Image.new("RGB", (W, H), "#0a0c10")
    glow = Image.new("RGB", (W, H), "#0a0c10")
    g = ImageDraw.Draw(glow)
    g.ellipse((-260, -420, 760, 360), fill="#16233f")
    g.ellipse((760, -380, 1500, 260), fill="#102a25")
    g.ellipse((360, 380, 1100, 900), fill="#101625")
    glow = glow.filter(ImageFilter.GaussianBlur(120))
    img = Image.blend(img, glow, 0.9)

    # subtle grid
    grid = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(grid)
    for x in range(0, W, 64):
        gd.line([(x, 0), (x, H)], fill=(255, 255, 255, 8))
    for y in range(0, H, 64):
        gd.line([(0, y), (W, y)], fill=(255, 255, 255, 8))
    mask = Image.new("L", (W, H), 0)
    md = ImageDraw.Draw(mask)
    for y in range(H):
        # fade the grid towards the bottom
        md.line([(0, y), (W, y)], fill=max(0, int(120 * (1 - y / H))))
    img = Image.composite(img, Image.alpha_composite(img.convert("RGBA"), grid).convert("RGB"), mask)
    return img


def draw_text(draw: ImageDraw.ImageDraw, xy: tuple[int, int], text: str, font, fill: str) -> None:
    draw.text(xy, text, font=font, fill=fill)


def paste_screenshot(img: Image.Image) -> None:
    if not SHOT.exists():
        return
    shot = Image.open(SHOT).convert("RGB")
    target_w = 560
    target_h = round(shot.height * target_w / shot.width)
    shot = shot.resize((target_w, target_h), Image.LANCZOS)
    radius = 16

    # drop shadow
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    x0, y0 = 690, 172
    sd.rounded_rectangle((x0 + 6, y0 + 18, x0 + target_w + 6, y0 + target_h + 18), radius=radius, fill=(0, 0, 0, 190))
    shadow = shadow.filter(ImageFilter.GaussianBlur(28))
    img.paste(Image.alpha_composite(img.convert("RGBA"), shadow).convert("RGB"), (0, 0))

    x0, y0 = 690, 172
    mask = rounded_mask((target_w, target_h), radius)
    img.paste(shot, (x0, y0), mask)

    border = ImageDraw.Draw(img)
    border.rounded_rectangle((x0, y0, x0 + target_w - 1, y0 + target_h - 1), radius=radius, outline="#2c3547", width=2)


def main() -> None:
    img = make_background()
    draw = ImageDraw.Draw(img)

    bold_xl, _ = load_fonts(74, 30)
    bold_md, _ = load_fonts(34, 22)
    _, regular_md = load_fonts(34, 28)
    _, regular_sm = load_fonts(34, 24)
    mono = ImageFont.truetype("C:/Windows/Fonts/consola.ttf", 20) if os.path.exists("C:/Windows/Fonts/consola.ttf") else regular_sm

    accent = "#6f9bff"
    text = "#eef1f7"
    muted = "#9aa4b6"
    dim = "#6f7a8d"

    # logo mark
    draw.rounded_rectangle((72, 62, 108, 98), radius=9, fill="#4f7cff")
    draw.line([(80, 90), (80, 70), (90, 82), (100, 70), (100, 90)], fill="#ffffff", width=3, joint="curve")

    draw_text(draw, (122, 66), "MDA", bold_md, text)
    draw_text(draw, (122, 100), "本地优先的 Markdown 工作台", regular_sm, dim)

    draw_text(draw, (72, 176), "Markdown", bold_xl, text)
    draw_text(draw, (72, 258), "工作台", bold_xl, text)
    draw_text(draw, (74, 372), "批注写进文件，预览里直接改。", regular_md, muted)
    draw_text(draw, (74, 412), "导出 Word / PDF / 公众号 · CLI 与 MCP", regular_sm, dim)

    # chips
    chips = ["GUI", "CLI", "MCP", "MIT · FREE"]
    x = 74
    y = 476
    for label in chips:
        font = mono if label in ("GUI", "CLI", "MCP") else regular_sm
        bbox = draw.textbbox((0, 0), label, font=font)
        tw = bbox[2] - bbox[0]
        pad = 14
        draw.rounded_rectangle((x, y, x + tw + pad * 2, y + 40), radius=20, fill="#141a26", outline="#2b3446", width=1)
        draw_text(draw, (x + pad, y + 7), label, font, accent if label != "MIT · FREE" else muted)
        x += tw + pad * 2 + 12

    draw_text(draw, (74, 556), "github.com/ShuiYunYueKeeper/mda-l2", mono, dim)
    draw_text(draw, (74, 586), "shuiyunyuekeeper.github.io/mda-l2", mono, dim)

    paste_screenshot(img)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUT, "PNG", optimize=True)
    print(f"wrote {OUT} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
