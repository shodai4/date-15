#!/usr/bin/env python3
"""
DATE-15 - Apple HIG App Icon & Splash Generator
Generates:
1. resources/icon.png (1024x1024 RGB, no alpha, for App Store)
2. resources/splash.png (2732x2732 RGB for iOS launch screen)
3. resources/AppIcon.appiconset/* (iOS asset catalog for Xcode)
4. Web icons (favicon.png, icon-192.png, icon-512.png, apple-touch-icon.png)
"""

import os
import json
from PIL import Image, ImageDraw, ImageFont

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES_DIR = os.path.join(ROOT_DIR, 'resources')
APPICON_DIR = os.path.join(RES_DIR, 'AppIcon.appiconset')

os.makedirs(RES_DIR, exist_ok=True)
os.makedirs(APPICON_DIR, exist_ok=True)

FONT_DIR = os.path.join(RES_DIR, 'fonts')

# Bundled subsets (Noto Sans JP, SIL OFL) so generation is identical on every OS.
BUNDLED_FONT_JP = os.path.join(FONT_DIR, 'NotoSansJP-Regular-subset.ttf')
BUNDLED_FONT_BOLD = os.path.join(FONT_DIR, 'NotoSansJP-Bold-subset.ttf')

# System fallbacks, used only when the bundled files are missing or lack a glyph.
# macOS runners and macOS desktops keep Hiragino in /System/Library/Fonts.
SYSTEM_FONT_JP = [
    '/System/Library/Fonts/ヒラギノ角ゴシック W3.ttc',
    '/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc',
    '/System/Library/Fonts/ヒラギノ角ゴシック W2.ttc',
    '/System/Library/Fonts/ヒラギノ丸ゴ ProN W4.ttc',
    '/System/Library/Fonts/ヒラギノ明朝 ProN.ttc',
    '/System/Library/Fonts/Hiragino Sans GB.ttc',
    '/System/Library/Fonts/Supplemental/Arial Unicode.ttf',
    '/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf',
    '/usr/share/fonts/opentype/ipaexfont-gothic/ipaexg.ttf',
    '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
    '/usr/share/fonts/truetype/fonts-japanese-gothic.ttf',
    '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc',
]
SYSTEM_FONT_LATIN_BOLD = [
    '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
    '/System/Library/Fonts/Supplemental/Arial Black.ttf',
    '/usr/share/fonts/truetype/freefont/FreeSansBold.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
]

FONT_CACHE = {}


def _glyph_bitmap(font, ch):
    mask = font.getmask(ch)
    return (mask.size, bytes(mask))


def _glyph_missing(font, text):
    """Return the characters of `text` that the font renders as .notdef (tofu)."""
    try:
        notdef = _glyph_bitmap(font, '\ue000')  # private-use char: never mapped
    except Exception as exc:  # coverage check unavailable: trust the font
        print(f"[Font] Coverage check unavailable ({exc}); assuming the font is complete")
        return []
    missing = []
    for ch in text:
        if ch.isspace():
            continue
        try:
            if _glyph_bitmap(font, ch) == notdef:
                missing.append(ch)
        except Exception:
            missing.append(ch)
    return missing


def get_font(size, text='', bold=False):
    """Load the first font that exists and can draw every character of `text`."""
    key = (size, text, bold)
    if key in FONT_CACHE:
        return FONT_CACHE[key]

    candidates = [BUNDLED_FONT_BOLD if bold else BUNDLED_FONT_JP]
    if bold:
        candidates += SYSTEM_FONT_LATIN_BOLD
    candidates += SYSTEM_FONT_JP

    opened = None
    for path in candidates:
        if not path or not os.path.exists(path):
            continue
        try:
            font = ImageFont.truetype(path, size)
        except OSError as exc:
            print(f"[Font] Cannot open {path}: {exc}")
            continue
        if opened is None:
            opened = (path, font)
        missing = _glyph_missing(font, text)
        if not missing:
            FONT_CACHE[key] = font
            return font
        print(f"[Font] {os.path.basename(path)} lacks {''.join(missing)!r}; trying next font")

    if opened is not None:
        print(f"[Font] WARNING: falling back to {opened[0]}; some glyphs may show as boxes")
        FONT_CACHE[key] = opened[1]
        return opened[1]

    print("[Font] WARNING: no usable font file found; using Pillow's built-in bitmap font")
    try:
        font = ImageFont.load_default(size=size)
    except TypeError:
        font = ImageFont.load_default()
    FONT_CACHE[key] = font
    return font

def create_app_icon():
    size = 1024
    img = Image.new('RGB', (size, size), (250, 245, 242)) # #FAF5F2
    draw = ImageDraw.Draw(img)
    
    # Soft warm gradient
    for y in range(size):
        r = int(250 - (y / size) * 12)
        g = int(245 - (y / size) * 14)
        b = int(242 - (y / size) * 14)
        draw.line([(0, y), (size, y)], fill=(r, g, b))
        
    # Elegant inner card frame
    margin = 80
    draw.rounded_rectangle(
        [(margin, margin), (size - margin, size - margin)],
        radius=140,
        fill=(255, 255, 255),
        outline=(216, 200, 191), # #D8C8BF
        width=12
    )
    
    # Inner decorative border (warm rose accent)
    inner_m = margin + 30
    draw.rounded_rectangle(
        [(inner_m, inner_m), (size - inner_m, size - inner_m)],
        radius=110,
        outline=(245, 235, 230),
        width=4
    )
    
    # Draw a stylized 3x5 manuscript grid (15 cells) representing "15 characters"
    cols = 5
    rows = 3
    grid_w = 440
    grid_h = 260
    cell_w = grid_w / cols
    cell_h = grid_h / rows
    gx0 = (size - grid_w) / 2
    gy0 = 240
    
    for r in range(rows):
        for c in range(cols):
            x = gx0 + c * cell_w
            y = gy0 + r * cell_h
            # Draw individual manuscript cell
            draw.rounded_rectangle(
                [(x + 4, y + 4), (x + cell_w - 4, y + cell_h - 4)],
                radius=10,
                fill=(253, 250, 248),
                outline=(226, 109, 109) if (r == 1 and c == 2) else (216, 200, 191),
                width=3
            )
            
    # Center character inside manuscript grid
    font_grid = get_font(48, '恋')
    draw.text((gx0 + 2 * cell_w + 18, gy0 + 1 * cell_h + 16), "恋", fill=(226, 109, 109), font=font_grid)
    
    # Bold "15" Logo in center
    num_text = "15"
    font_num = get_font(230, num_text, bold=True)
    num_bbox = draw.textbbox((0, 0), num_text, font=font_num)
    num_w = num_bbox[2] - num_bbox[0]
    num_x = (size - num_w) // 2
    draw.text((num_x, 480), num_text, fill=(56, 44, 38), font=font_num) # #382C26
    
    # Japanese Subtitle "文字デート"
    sub_text = "文字デート"
    font_sub = get_font(84, sub_text)
    sub_bbox = draw.textbbox((0, 0), sub_text, font=font_sub)
    sub_w = sub_bbox[2] - sub_bbox[0]
    sub_x = (size - sub_w) // 2
    draw.text((sub_x, 740), sub_text, fill=(194, 125, 102), font=font_sub) # #C27D66
    
    # Little warm heart dot at bottom
    draw.ellipse([(size//2 - 16, 880), (size//2 + 16, 912)], fill=(226, 109, 109))
    
    out_path = os.path.join(RES_DIR, 'icon.png')
    img.save(out_path, format='PNG', optimize=True)
    print(f"[Icon] Generated 1024x1024 App Icon: {out_path}")
    return img

def create_splash_screen(icon_img):
    size = 2732
    splash = Image.new('RGB', (size, size), (250, 245, 242)) # #FAF5F2
    draw = ImageDraw.Draw(splash)
    
    # Soft background gradient
    for y in range(size):
        r = int(250 - (y / size) * 8)
        g = int(245 - (y / size) * 10)
        b = int(242 - (y / size) * 10)
        draw.line([(0, y), (size, y)], fill=(r, g, b))
        
    # Center scaled icon
    icon_scaled = icon_img.resize((680, 680), Image.Resampling.LANCZOS)
    icon_x = (size - 680) // 2
    icon_y = (size - 680) // 2 - 120
    splash.paste(icon_scaled, (icon_x, icon_y))
    
    # App title below
    title = "理想のデートを15文字でどうぞ。"
    font_title = get_font(96, title)
    t_bbox = draw.textbbox((0, 0), title, font=font_title)
    t_w = t_bbox[2] - t_bbox[0]
    draw.text(((size - t_w) // 2, icon_y + 760), title, fill=(56, 44, 38), font=font_title)
    
    # Subtitle
    sub = "たった15文字で綴る、ふたりだけの愛おしい日常。"
    font_sub = get_font(48, sub)
    s_bbox = draw.textbbox((0, 0), sub, font=font_sub)
    s_w = s_bbox[2] - s_bbox[0]
    draw.text(((size - s_w) // 2, icon_y + 880), sub, fill=(194, 125, 102), font=font_sub)
    
    out_path = os.path.join(RES_DIR, 'splash.png')
    splash.save(out_path, format='PNG', optimize=True)
    print(f"[Splash] Generated 2732x2732 Splash Screen: {out_path}")

def generate_ios_asset_catalog(icon_img):
    specs = [
        (20, 1, "20x20", "iphone", "1x"),
        (20, 2, "20x20", "iphone", "2x"),
        (20, 3, "20x20", "iphone", "3x"),
        (29, 1, "29x29", "iphone", "1x"),
        (29, 2, "29x29", "iphone", "2x"),
        (29, 3, "29x29", "iphone", "3x"),
        (40, 2, "40x40", "iphone", "2x"),
        (40, 3, "40x40", "iphone", "3x"),
        (60, 2, "60x60", "iphone", "2x"),
        (60, 3, "60x60", "iphone", "3x"),
        (20, 1, "20x20", "ipad", "1x"),
        (20, 2, "20x20", "ipad", "2x"),
        (29, 1, "29x29", "ipad", "1x"),
        (29, 2, "29x29", "ipad", "2x"),
        (40, 1, "40x40", "ipad", "1x"),
        (40, 2, "40x40", "ipad", "2x"),
        (76, 1, "76x76", "ipad", "1x"),
        (76, 2, "76x76", "ipad", "2x"),
        (83.5, 2, "83.5x83.5", "ipad", "2x"),
        (1024, 1, "1024x1024", "ios-marketing", "1x")
    ]
    
    images_metadata = []
    for pt, scale, size_str, idiom, scale_str in specs:
        px = int(round(pt * scale))
        filename = f"AppIcon-{size_str}@{scale_str}.png"
        filepath = os.path.join(APPICON_DIR, filename)
        resized = icon_img.resize((px, px), Image.Resampling.LANCZOS)
        resized.save(filepath, format='PNG', optimize=True)
        
        images_metadata.append({
            "size": size_str,
            "idiom": idiom,
            "filename": filename,
            "scale": scale_str
        })
        
    contents = {
        "images": images_metadata,
        "info": {
            "version": 1,
            "author": "xcode"
        }
    }
    with open(os.path.join(APPICON_DIR, 'Contents.json'), 'w', encoding='utf-8') as f:
        json.dump(contents, f, indent=2)
    print(f"[Assets] Generated Xcode AppIcon.appiconset with {len(specs)} icon variants!")

def generate_web_favicons(icon_img):
    web_specs = [
        ('favicon.png', 64),
        ('apple-touch-icon.png', 180),
        ('icon-192.png', 192),
        ('icon-512.png', 512)
    ]
    for filename, px in web_specs:
        out_path = os.path.join(ROOT_DIR, filename)
        resized = icon_img.resize((px, px), Image.Resampling.LANCZOS)
        resized.save(out_path, format='PNG', optimize=True)
        print(f"[Web Icon] Saved {filename} ({px}x{px})")

def main():
    print("[Assets] Starting Apple HIG Asset Generation for DATE-15...")
    icon_img = create_app_icon()
    create_splash_screen(icon_img)
    generate_ios_asset_catalog(icon_img)
    generate_web_favicons(icon_img)
    print("[Assets] All DATE-15 assets generated successfully!")

if __name__ == '__main__':
    main()
