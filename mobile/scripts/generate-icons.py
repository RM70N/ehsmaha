#!/usr/bin/env python3
"""
يولّد أيقونة التطبيق وشاشة الإقلاع لأندرويد من شعار الموقع الأصلي
(build/source-logo.png — نفس الفافيكون المستخرج من index.html، مربّع بخلفية
بنفسجية متدرّجة وشكل تاج أبيض في المنتصف).

يُشغَّل مرة واحدة يدوياً (يحتاج Pillow: `pip install pillow`) ويكتب مباشرة
داخل android/app/src/main/res/*. النتائج تُحفَظ في المستودع كملفات ثابتة —
لا حاجة لتشغيله في كل بناء (على عكس سكربتات الغلاف الأخرى)، فقط عند تغيير
الشعار.
"""

import os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(ROOT, 'android', 'app', 'src', 'main', 'res')
SOURCE = os.path.join(ROOT, 'build', 'source-logo.png')

BRAND_PURPLE = (124, 58, 237)       # --accent
BRAND_BG_DARK = (11, 5, 24)         # --bg
BRAND_BG_MID = (26, 16, 48)         # قريب من --bg-2/--surface

LEGACY_SIZES = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}
FOREGROUND_SIZES = {'mdpi': 108, 'hdpi': 162, 'xhdpi': 216, 'xxhdpi': 324, 'xxxhdpi': 432}
SPLASH_PORT = {
    'mdpi': (320, 480), 'hdpi': (480, 800), 'xhdpi': (720, 1280),
    'xxhdpi': (960, 1600), 'xxxhdpi': (1280, 1920),
}
SPLASH_LAND = {
    'mdpi': (480, 320), 'hdpi': (800, 480), 'xhdpi': (1280, 720),
    'xxhdpi': (1600, 960), 'xxxhdpi': (1920, 1280),
}


def extract_crown_alpha(source: Image.Image) -> Image.Image:
    """يستخرج شكل التاج الأبيض وحده (شفاف بدل الخلفية البنفسجية) عبر قياس
    مدى قرب كل بكسل من الأبيض الخالص — التاج أبيض نقي والخلفية بنفسجية،
    فالفارق واضح بما يكفي لعتبة ثابتة.

    نقتصر على المنطقة الوسطى من الصورة (نستبعد ~20% من كل حافة) لأن حواف
    المربّع الأصلي مقصوصة بزوايا دائرية عبر alpha، وحلقة التنعيم
    (antialiasing) عند تلك الحافة تعطي بكسلات فاتحة اللون قد تُخطئ التصنيف
    كجزء من التاج لو فحصنا الصورة كاملة. التاج نفسه بعيد تماماً عن الحواف
    فهذا الاقتصاص آمن.
    """
    src = source.convert('RGBA')
    px = src.load()
    w, h = src.size
    margin_x, margin_y = int(w * 0.20), int(h * 0.20)
    out = Image.new('RGBA', (w, h), (255, 255, 255, 0))
    outpx = out.load()
    threshold_low, threshold_high = 150, 235
    for y in range(margin_y, h - margin_y):
        for x in range(margin_x, w - margin_x):
            r, g, b, a = px[x, y]
            whiteness = min(r, g, b)
            if whiteness <= threshold_low:
                alpha = 0
            elif whiteness >= threshold_high:
                alpha = 255
            else:
                alpha = int((whiteness - threshold_low) / (threshold_high - threshold_low) * 255)
            outpx[x, y] = (255, 255, 255, alpha)
    return out


def bbox_of(img: Image.Image):
    return img.getbbox()


def make_foreground(crown: Image.Image, canvas_size: int) -> Image.Image:
    """يضع التاج في منتصف مساحة الأيقونة التكيّفية ضمن "المنطقة الآمنة"
    (~66/108 من المساحة) حتى لا يُقصّ عند القناع الدائري/المربّع من النظام."""
    bbox = bbox_of(crown)
    cropped = crown.crop(bbox)
    safe_ratio = 0.60
    target = int(canvas_size * safe_ratio)
    cw, ch = cropped.size
    scale = target / max(cw, ch)
    resized = cropped.resize((max(1, int(cw * scale)), max(1, int(ch * scale))), Image.LANCZOS)
    canvas = Image.new('RGBA', (canvas_size, canvas_size), (0, 0, 0, 0))
    ox = (canvas_size - resized.width) // 2
    oy = (canvas_size - resized.height) // 2
    canvas.paste(resized, (ox, oy), resized)
    return canvas


def make_legacy(source: Image.Image, size: int) -> Image.Image:
    return source.resize((size, size), Image.LANCZOS)


def gradient_background(w: int, h: int) -> Image.Image:
    """تدرّج قطري بسيط من بنفسجي غامق لأسود بنفسجي — يطابق خلفية الموقع
    وشاشة انتظار نسخة سطح المكتب."""
    img = Image.new('RGB', (w, h), BRAND_BG_DARK)
    top = BRAND_BG_MID
    bottom = BRAND_BG_DARK
    for y in range(h):
        t = y / max(1, h - 1)
        r = int(top[0] + (bottom[0] - top[0]) * t)
        g = int(top[1] + (bottom[1] - top[1]) * t)
        b = int(top[2] + (bottom[2] - top[2]) * t)
        ImageDraw.Draw(img).line([(0, y), (w, y)], fill=(r, g, b))
    return img


def make_splash(crown: Image.Image, w: int, h: int) -> Image.Image:
    bg = gradient_background(w, h)
    bbox = bbox_of(crown)
    cropped = crown.crop(bbox)
    target = int(min(w, h) * 0.30)
    cw, ch = cropped.size
    scale = target / max(cw, ch)
    resized = cropped.resize((max(1, int(cw * scale)), max(1, int(ch * scale))), Image.LANCZOS)
    # لمسة الشعار الأصلية (خلفية بنفسجية مدوّرة خلف التاج) بدل تاج عائم بلا حاوية
    pad = int(target * 0.42)
    plate_size = resized.width + pad if resized.width > resized.height else resized.height + pad
    plate = Image.new('RGBA', (plate_size, plate_size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(plate)
    radius = int(plate_size * 0.27)
    draw.rounded_rectangle([0, 0, plate_size - 1, plate_size - 1], radius=radius, fill=BRAND_PURPLE + (255,))
    px = (plate_size - resized.width) // 2
    py = (plate_size - resized.height) // 2
    plate.paste(resized, (px, py), resized)

    bg = bg.convert('RGBA')
    ox = (w - plate_size) // 2
    oy = (h - plate_size) // 2
    bg.paste(plate, (ox, oy), plate)
    return bg.convert('RGB')


def main():
    source = Image.open(SOURCE)
    crown = extract_crown_alpha(source)

    for density, size in LEGACY_SIZES.items():
        legacy = make_legacy(source, size)
        legacy.save(os.path.join(RES, f'mipmap-{density}', 'ic_launcher.png'))
        legacy.save(os.path.join(RES, f'mipmap-{density}', 'ic_launcher_round.png'))
        print(f'legacy icon {density}: {size}x{size}')

    for density, size in FOREGROUND_SIZES.items():
        fg = make_foreground(crown, size)
        fg.save(os.path.join(RES, f'mipmap-{density}', 'ic_launcher_foreground.png'))
        print(f'foreground {density}: {size}x{size}')

    for density, (w, h) in SPLASH_PORT.items():
        make_splash(crown, w, h).save(os.path.join(RES, f'drawable-port-{density}', 'splash.png'))
        print(f'splash port {density}: {w}x{h}')

    for density, (w, h) in SPLASH_LAND.items():
        make_splash(crown, w, h).save(os.path.join(RES, f'drawable-land-{density}', 'splash.png'))
        print(f'splash land {density}: {w}x{h}')

    # الافتراضي بلا مؤهّل كثافة — نسخة عن land-mdpi (نفس ما ولّده Capacitor أصلاً)
    make_splash(crown, 480, 320).save(os.path.join(RES, 'drawable', 'splash.png'))
    print('splash default: 480x320')


if __name__ == '__main__':
    main()
