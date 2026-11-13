#!/usr/bin/env python3
"""
DATE-15 - App Store Screenshot Generator (Apple HIG 6.7" Display: 1290 x 2796 px)
Generates high-resolution App Store Connect promotional screenshots ready for submission.
"""

import os
from PIL import Image, ImageDraw, ImageFont

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT_DIR, 'resources', 'screenshots')
os.makedirs(OUT_DIR, exist_ok=True)

WIDTH = 1290
HEIGHT = 2796

FONT_JP = '/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf'
FONT_EN = '/usr/share/fonts/truetype/freefont/FreeSansBold.ttf'

font_tag = ImageFont.truetype(FONT_JP, 32)
font_title = ImageFont.truetype(FONT_JP, 62)
font_subtitle = ImageFont.truetype(FONT_JP, 34)
font_jp_sm = ImageFont.truetype(FONT_JP, 22)
font_jp_md = ImageFont.truetype(FONT_JP, 26)
font_jp_lg = ImageFont.truetype(FONT_JP, 32)

SCREENSHOTS = [
    {
        'file': 'screenshot-1-roulette.png',
        'tag': 'ふたりの運命を決める × 恋のルーレット',
        'title': '今日なにする？を15文字で解決',
        'sub': '迷ったデートはスロットで決定。ふたりだけの愛おしい日常。',
        'theme_color': (226, 109, 109), # rose accent
        'screen_type': 'roulette'
    },
    {
        'file': 'screenshot-2-manuscript.png',
        'tag': '原稿用紙風15マス × 厳格ルール',
        'title': 'ピッタリ15文字の言葉パズル',
        'sub': '14文字でも16文字でもない。俳句や短歌のように紡ぐ。',
        'theme_color': (194, 125, 102), # latte
        'screen_type': 'manuscript'
    },
    {
        'file': 'screenshot-3-ranking.png',
        'tag': 'みんなの理想 × いいねランキング',
        'title': '共感あふれるデートプラン集',
        'sub': '人気順・新着順で眺める、みんなのキュンとする瞬間。',
        'theme_color': (217, 119, 6), # warm gold
        'screen_type': 'ranking'
    },
    {
        'file': 'screenshot-4-zine.png',
        'tag': 'アートZINE出版連動 × 翔大企画',
        'title': 'あなたの15文字が書籍に載る',
        'sub': '投稿された珠玉のプランは、画家・翔大によるリトルプレス冊子に収録。',
        'theme_color': (16, 185, 129), # emerald
        'screen_type': 'zine'
    }
]

def create_base_canvas():
    img = Image.new('RGB', (WIDTH, HEIGHT), (250, 245, 242)) # #FAF5F2
    draw = ImageDraw.Draw(img)
    
    # Warm cafe gradient
    for y in range(HEIGHT):
        ratio = y / HEIGHT
        r = int(250 - ratio * 15)
        g = int(245 - ratio * 18)
        b = int(242 - ratio * 18)
        draw.line([(0, y), (WIDTH, y)], fill=(r, g, b))
        
    return img, draw

def draw_header(draw, item):
    tag_text = item['tag']
    title_text = item['title']
    sub_text = item['sub']
    theme_color = item['theme_color']
    
    # Pill Tag
    tag_bbox = draw.textbbox((0, 0), tag_text, font=font_tag)
    tag_w = tag_bbox[2] - tag_bbox[0]
    tag_h = tag_bbox[3] - tag_bbox[1]
    tag_x = (WIDTH - tag_w) // 2
    tag_y = 140
    
    pad_x = 28
    pad_y = 12
    draw.rounded_rectangle(
        [(tag_x - pad_x, tag_y - pad_y), (tag_x + tag_w + pad_x, tag_y + tag_h + pad_y)],
        radius=24,
        fill=(255, 255, 255),
        outline=theme_color,
        width=2
    )
    draw.text((tag_x, tag_y), tag_text, fill=theme_color, font=font_tag)
    
    # Big Title
    title_bbox = draw.textbbox((0, 0), title_text, font=font_title)
    title_w = title_bbox[2] - title_bbox[0]
    title_x = (WIDTH - title_w) // 2
    draw.text((title_x, 230), title_text, fill=(56, 44, 38), font=font_title)
    
    # Subtitle
    sub_bbox = draw.textbbox((0, 0), sub_text, font=font_subtitle)
    sub_w = sub_bbox[2] - sub_bbox[0]
    sub_x = (WIDTH - sub_w) // 2
    draw.text((sub_x, 325), sub_text, fill=(140, 122, 112), font=font_subtitle)

def draw_phone_frame(img, draw):
    phone_x1 = 90
    phone_y1 = 440
    phone_x2 = WIDTH - 90
    phone_y2 = HEIGHT + 100
    
    # Outer bezel
    draw.rounded_rectangle(
        [(phone_x1, phone_y1), (phone_x2, phone_y2)],
        radius=68,
        fill=(245, 238, 232),
        outline=(216, 200, 191),
        width=6
    )
    
    # Screen inner area
    inner_x1 = phone_x1 + 18
    inner_y1 = phone_y1 + 18
    inner_x2 = phone_x2 - 18
    inner_y2 = phone_y2
    
    draw.rounded_rectangle(
        [(inner_x1, inner_y1), (inner_x2, inner_y2)],
        radius=54,
        fill=(250, 245, 242)
    )
    
    # Dynamic Island notch
    island_w = 260
    island_h = 52
    island_x = (WIDTH - island_w) // 2
    island_y = inner_y1 + 22
    draw.rounded_rectangle(
        [(island_x, island_y), (island_x + island_w, island_y + island_h)],
        radius=26,
        fill=(0, 0, 0),
        outline=(56, 44, 38),
        width=1
    )
    
    return (inner_x1, inner_y1, inner_x2, inner_y2)

def compose_roulette_screen(screen_img, inner_box):
    draw = ImageDraw.Draw(screen_img)
    x1, y1, x2, y2 = inner_box
    sw = x2 - x1
    
    # Header bar
    hy = y1 + 100
    draw.text((x1 + 40, hy), "理想のデートを15文字でどうぞ。", fill=(56, 44, 38), font=font_jp_lg)
    
    # Roulette Card
    cx = x1 + 36
    cy = hy + 80
    cw = sw - 72
    ch = 620
    draw.rounded_rectangle([(cx, cy), (cx + cw, cy + ch)], radius=28, fill=(255, 255, 255), outline=(216, 200, 191), width=2)
    
    # Card Header
    draw.text((cx + 36, cy + 36), "運命のデートルーレット", fill=(194, 125, 102), font=font_jp_md)
    draw.text((cx + 36, cy + 80), "「今日なにする？」ふたりでボタンを押してみて", fill=(140, 122, 112), font=font_jp_sm)
    
    # Result Box (Highlighted)
    ry = cy + 140
    rw = cw - 72
    draw.rounded_rectangle([(cx + 36, ry), (cx + 36 + rw, ry + 220)], radius=20, fill=(254, 242, 242), outline=(226, 109, 109), width=3)
    
    # Big result text (Exactly 15 chars!)
    plan_text = "深夜のドライブで静かな海を見に"
    font_plan = ImageFont.truetype(FONT_JP, 40)
    p_bbox = draw.textbbox((0, 0), plan_text, font=font_plan)
    p_w = p_bbox[2] - p_bbox[0]
    draw.text((cx + 36 + (rw - p_w)//2, ry + 70), plan_text, fill=(56, 44, 38), font=font_plan)
    draw.text((cx + 36 + (rw - p_w)//2 + 180, ry + 140), "いいね: 289件", fill=(226, 109, 109), font=font_jp_sm)
    
    # Big Spin Button
    by = ry + 260
    draw.rounded_rectangle([(cx + 36, by), (cx + 36 + rw, by + 100)], radius=22, fill=(226, 109, 109))
    btn_text = "もう一度決める"
    font_btn = ImageFont.truetype(FONT_JP, 36)
    b_bbox = draw.textbbox((0, 0), btn_text, font=font_btn)
    b_w = b_bbox[2] - b_bbox[0]
    draw.text((cx + 36 + (rw - b_w)//2, by + 30), btn_text, fill=(255, 255, 255), font=font_btn)

def compose_manuscript_screen(screen_img, inner_box):
    draw = ImageDraw.Draw(screen_img)
    x1, y1, x2, y2 = inner_box
    sw = x2 - x1
    
    hy = y1 + 100
    draw.text((x1 + 40, hy), "あなたの理想を15文字で投稿", fill=(56, 44, 38), font=font_jp_lg)
    
    cx = x1 + 36
    cy = hy + 80
    cw = sw - 72
    ch = 820
    draw.rounded_rectangle([(cx, cy), (cx + cw, cy + ch)], radius=28, fill=(255, 255, 255), outline=(216, 200, 191), width=2)
    
    draw.text((cx + 36, cy + 36), "15マス原稿用紙", fill=(194, 125, 102), font=font_jp_md)
    draw.text((cx + 36, cy + 80), "ピッタリ15文字になると送信ボタンが解放されます", fill=(140, 122, 112), font=font_jp_sm)
    
    # 15 cells grid (3 rows x 5 cols)
    sample_text = "古本屋で五百円分選び合ってみる" # 15 chars
    grid_y = cy + 140
    cell_size = 80
    gap = 14
    start_x = cx + (cw - (cell_size * 5 + gap * 4)) // 2
    
    for idx, ch_char in enumerate(sample_text):
        row = idx // 5
        col = idx % 5
        cell_x = start_x + col * (cell_size + gap)
        cell_y = grid_y + row * (cell_size + gap)
        
        draw.rounded_rectangle([(cell_x, cell_y), (cell_x + cell_size, cell_y + cell_size)], radius=12, fill=(255, 253, 251), outline=(226, 109, 109), width=2)
        font_c = ImageFont.truetype(FONT_JP, 40)
        c_bbox = draw.textbbox((0, 0), ch_char, font=font_c)
        cw_c = c_bbox[2] - c_bbox[0]
        draw.text((cell_x + (cell_size - cw_c)//2, cell_y + 18), ch_char, fill=(45, 35, 30), font=font_c)
        
    # Counter Badge
    count_y = grid_y + 3 * (cell_size + gap) + 20
    draw.rounded_rectangle([(cx + cw//2 - 140, count_y), (cx + cw//2 + 140, count_y + 50)], radius=14, fill=(254, 242, 242), outline=(226, 109, 109), width=1)
    draw.text((cx + cw//2 - 100, count_y + 10), "15 / 15文字 (完璧!)", fill=(226, 109, 109), font=font_jp_md)
    
    # Submit Button
    sub_y = count_y + 80
    draw.rounded_rectangle([(cx + 36, sub_y), (cx + cw - 36, sub_y + 90)], radius=20, fill=(226, 109, 109))
    sub_text = "プランを投稿する"
    font_sub_btn = ImageFont.truetype(FONT_JP, 32)
    sb_bbox = draw.textbbox((0, 0), sub_text, font=font_sub_btn)
    sb_w = sb_bbox[2] - sb_bbox[0]
    draw.text((cx + (cw - sb_w)//2, sub_y + 28), sub_text, fill=(255, 255, 255), font=font_sub_btn)

def compose_ranking_screen(screen_img, inner_box):
    draw = ImageDraw.Draw(screen_img)
    x1, y1, x2, y2 = inner_box
    sw = x2 - x1
    
    hy = y1 + 100
    draw.text((x1 + 40, hy), "みんなのデートプラン", fill=(56, 44, 38), font=font_jp_lg)
    
    # Sort Tabs
    ty = hy + 60
    tabs = ["人気順", "新着順", "ランダム"]
    tw = 160
    for idx, t in enumerate(tabs):
        tx = x1 + 40 + idx * (tw + 14)
        is_active = (idx == 0)
        fill_c = (226, 109, 109) if is_active else (255, 255, 255)
        text_c = (255, 255, 255) if is_active else (140, 122, 112)
        draw.rounded_rectangle([(tx, ty), (tx + tw, ty + 50)], radius=14, fill=fill_c, outline=(216, 200, 191), width=1)
        draw.text((tx + 36, ty + 12), t, fill=text_c, font=font_jp_md)
        
    # Plan Cards List
    py = ty + 80
    plans = [
        ("深夜のドライブで静かな海を見に", "289", "第1位"),
        ("早朝の市場で熱い朝ラーメン食う", "251", "第2位"),
        ("古本屋で五百円分選び合ってみる", "218", "第3位"),
        ("見知らぬ駅でふらり途中下車する", "203", "第4位"),
        ("昔ながらの駄菓子屋で三百円豪遊", "175", "第5位")
    ]
    
    for text, likes, rank in plans:
        draw.rounded_rectangle([(x1 + 36, py), (x2 - 36, py + 120)], radius=18, fill=(255, 255, 255), outline=(216, 200, 191), width=1)
        
        # Rank Tag
        draw.rounded_rectangle([(x1 + 54, py + 22), (x1 + 140, py + 58)], radius=8, fill=(254, 242, 242))
        draw.text((x1 + 64, py + 28), rank, fill=(226, 109, 109), font=font_jp_sm)
        
        # Text
        draw.text((x1 + 160, py + 26), text, fill=(56, 44, 38), font=font_jp_md)
        draw.text((x1 + 54, py + 72), f"いいね: {likes}", fill=(140, 122, 112), font=font_jp_sm)
        
        # Like Button Pill
        lb_w = 110
        lb_x = x2 - 36 - lb_w - 20
        lb_y = py + 36
        draw.rounded_rectangle([(lb_x, lb_y), (lb_x + lb_w, lb_y + 48)], radius=12, fill=(254, 242, 242), outline=(226, 109, 109), width=1)
        draw.text((lb_x + 20, lb_y + 12), "いいね!", fill=(226, 109, 109), font=font_jp_sm)
        
        py += 140

def compose_zine_screen(screen_img, inner_box):
    draw = ImageDraw.Draw(screen_img)
    x1, y1, x2, y2 = inner_box
    sw = x2 - x1
    
    hy = y1 + 100
    draw.text((x1 + 40, hy), "アートZINE出版連動プロジェクト", fill=(56, 44, 38), font=font_jp_lg)
    
    cx = x1 + 36
    cy = hy + 80
    cw = sw - 72
    ch = 920
    draw.rounded_rectangle([(cx, cy), (cx + cw, cy + ch)], radius=28, fill=(255, 255, 255), outline=(216, 200, 191), width=2)
    
    draw.text((cx + 36, cy + 36), "『理想のデート15文字ZINE』企画", fill=(194, 125, 102), font=font_jp_md)
    draw.text((cx + 36, cy + 80), "アプリに投稿されたプランから厳選収録", fill=(140, 122, 112), font=font_jp_sm)
    
    features = [
        ("● 画家・翔大によるリトルプレス", "投稿された珠玉の15文字プランは、企画者（画家・翔大）の手によって実際のアートZINE（冊子）として出版されます。"),
        ("● 展覧会・個展での配布＆展示", "アトリエ三月などのギャラリー展示やイベントにて、完成したZINEを展示・販売展開予定。"),
        ("● 掲載料・参加費は完全無料", "アプリから15文字を投稿するだけで、誰でも書籍化の共同創作者としてエントリーされます。"),
        ("● BASEショップで全国お届け", "完成したアートZINEや関連作品は、BASEショップ「お絵描き楽しも委員会」を通じて全国へお届けします。")
    ]
    
    fy = cy + 140
    for title, desc in features:
        draw.rounded_rectangle([(cx + 30, fy), (cx + cw - 30, fy + 160)], radius=16, fill=(250, 245, 242), outline=(216, 200, 191), width=1)
        draw.text((cx + 50, fy + 22), title, fill=(226, 109, 109), font=font_jp_md)
        
        chars_per_line = 24
        desc_lines = [desc[i:i+chars_per_line] for i in range(0, len(desc), chars_per_line)]
        dy = fy + 65
        for l in desc_lines[:3]:
            draw.text((cx + 50, dy), l, fill=(140, 122, 112), font=font_jp_sm)
            dy += 28
            
        fy += 180

def main():
    print(f"[Screenshot Generator] Target resolution: {WIDTH}x{HEIGHT} (6.7-inch display)")
    for item in SCREENSHOTS:
        print(f"[Screenshot Generator] Generating: {item['file']} ({item['title']})...")
        img, draw = create_base_canvas()
        draw_header(draw, item)
        inner_box = draw_phone_frame(img, draw)
        
        stype = item['screen_type']
        if stype == 'roulette':
            compose_roulette_screen(img, inner_box)
        elif stype == 'manuscript':
            compose_manuscript_screen(img, inner_box)
        elif stype == 'ranking':
            compose_ranking_screen(img, inner_box)
        elif stype == 'zine':
            compose_zine_screen(img, inner_box)
            
        out_path = os.path.join(OUT_DIR, item['file'])
        img.save(out_path, format='PNG', optimize=True)
        print(f"[Screenshot Generator] Saved: {out_path}")
        
    print("[Screenshot Generator] All 4 App Store screenshots for DATE-15 successfully generated!")

if __name__ == '__main__':
    main()
