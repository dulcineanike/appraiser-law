# -*- coding: utf-8 -*-
"""
生成 PWA 所需之 192x192 與 512x512 PNG 圖示
"""

import os
from PIL import Image, ImageDraw, ImageFont

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ICONS_DIR = os.path.join(BASE_DIR, "icons")
os.makedirs(ICONS_DIR, exist_ok=True)

def generate_icon(size, output_path):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Rounded rectangle background
    radius = int(size * 0.2)
    # Draw dark navy rounded rect
    draw.rounded_rectangle([0, 0, size, size], radius=radius, fill=(15, 23, 42, 255))
    
    # Inner border
    draw.rounded_rectangle([int(size*0.03), int(size*0.03), int(size*0.97), int(size*0.97)], 
                           radius=int(radius*0.85), outline=(59, 130, 246, 120), width=max(2, int(size*0.015)))

    # Balance scale / pillar in gold
    gold = (245, 158, 11, 255)
    light_gold = (254, 240, 138, 255)
    center_x = size // 2
    
    # Pillar
    p_w = max(4, int(size * 0.04))
    draw.rectangle([center_x - p_w//2, int(size * 0.22), center_x + p_w//2, int(size * 0.65)], fill=gold)
    
    # Base
    draw.polygon([
        (center_x - int(size*0.18), int(size * 0.65)),
        (center_x + int(size*0.18), int(size * 0.65)),
        (center_x + int(size*0.22), int(size * 0.72)),
        (center_x - int(size*0.22), int(size * 0.72))
    ], fill=gold)
    
    # Top finial
    draw.ellipse([center_x - int(size*0.04), int(size * 0.18), center_x + int(size*0.04), int(size * 0.26)], fill=gold)
    
    # Horizontal Beam
    draw.rectangle([center_x - int(size*0.32), int(size * 0.24), center_x + int(size*0.32), int(size * 0.27)], fill=gold)
    
    # Left pan strings & pan
    left_x = center_x - int(size * 0.3)
    draw.line([(left_x, int(size * 0.27)), (left_x - int(size*0.08), int(size * 0.44))], fill=light_gold, width=max(1, int(size*0.01)))
    draw.line([(left_x, int(size * 0.27)), (left_x + int(size*0.08), int(size * 0.44))], fill=light_gold, width=max(1, int(size*0.01)))
    draw.chord([left_x - int(size*0.11), int(size * 0.38), left_x + int(size*0.11), int(size * 0.52)], 0, 180, fill=gold)
    
    # Right pan strings & pan
    right_x = center_x + int(size * 0.3)
    draw.line([(right_x, int(size * 0.27)), (right_x - int(size*0.08), int(size * 0.44))], fill=light_gold, width=max(1, int(size*0.01)))
    draw.line([(right_x, int(size * 0.27)), (right_x + int(size*0.08), int(size * 0.44))], fill=light_gold, width=max(1, int(size*0.01)))
    draw.chord([right_x - int(size*0.11), int(size * 0.38), right_x + int(size*0.11), int(size * 0.52)], 0, 180, fill=gold)

    # Add text "估價" inside
    try:
        font_size = int(size * 0.14)
        # Try finding standard font
        font = None
        for font_name in ["msjh.ttc", "mingliu.ttc", "simsun.ttc", "arial.ttf"]:
            try:
                font = ImageFont.truetype(font_name, font_size)
                break
            except:
                continue
        if font:
            text = "估價"
            bbox = draw.textbbox((0, 0), text, font=font)
            w = bbox[2] - bbox[0]
            draw.text((center_x - w // 2, int(size * 0.76)), text, fill=(255, 255, 255, 255), font=font)
    except Exception as e:
        print("Font note:", e)

    img.save(output_path, "PNG")
    print(f"Generated: {output_path} ({size}x{size})")

def main():
    generate_icon(192, os.path.join(ICONS_DIR, "icon-192.png"))
    generate_icon(512, os.path.join(ICONS_DIR, "icon-512.png"))

if __name__ == "__main__":
    main()
