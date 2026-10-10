"""Render the 3 pinned launch posts (1080x1350) in the primary colour identity.

Pinned 1: launch · Pinned 2: services carousel (5 slides) · Pinned 3: how we start.
Usage: python3 build_pinned.py  -> design/agency/out/posts/*.png
"""
import os, subprocess
from PIL import Image
from build_assets import FONT_CSS, ICONS, NEON, NEON_TEXT, BLACK, CHROME, SRC, OUT

POSTS = os.path.join(OUT, "posts")
MARK = os.path.join(OUT, "procore-media-mark-color.png")
W, H = 1080, 1350

BASE = f"""{FONT_CSS}
html, body {{ width:{W}px; height:{H}px; background:{BLACK}; overflow:hidden; }}
.p {{ position:relative; width:{W}px; height:{H}px; overflow:hidden; background:{BLACK}; color:#fff; }}
.glow {{ position:absolute; border-radius:50%; filter:blur(150px); }}
.foot {{ position:absolute; left:70px; right:70px; bottom:60px; display:flex; justify-content:space-between; align-items:center; }}
.foot img {{ width:70px; }}
.handle {{ font:500 26px Poppins; letter-spacing:3px; opacity:.75; }}
.ar {{ font-family:Tajawal; direction:rtl; }}
.neon {{ {NEON_TEXT} }}
.bar {{ position:absolute; left:0; right:0; bottom:0; height:10px; background:{NEON}; }}
"""


def glows():
    return ('<div class="glow" style="width:700px;height:700px;background:#2F6BFF;opacity:.30;left:-250px;top:-250px"></div>'
            '<div class="glow" style="width:650px;height:650px;background:#F2349E;opacity:.22;right:-250px;bottom:-200px"></div>')


def foot():
    return f'<div class="foot"><img src="{MARK}"><div class="handle">@procore.media</div></div><div class="bar"></div>'


def render(name, inner):
    html = f'<!doctype html><html><head><meta charset="utf-8"><style>{BASE}</style></head><body><div class="p">{glows()}{inner}{foot()}</div></body></html>'
    src = os.path.join(SRC, f"post-{name}.html")
    open(src, "w").write(html)
    out = os.path.join(POSTS, f"{name}.png")
    subprocess.run([CHROME, "--headless", "--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--allow-file-access-from-files",
                    "--virtual-time-budget=3000", f"--window-size={W},{H + 200}", f"--screenshot={out}", "file://" + src],
                   capture_output=True)
    Image.open(out).convert("RGB").crop((0, 0, W, H)).save(out)
    print("rendered", name)


def icon(key, size=260):
    return (f'<svg viewBox="0 0 48 48" width="{size}" height="{size}" fill="none" stroke="url(#ng)" stroke-width="2.2" '
            'stroke-linecap="round" stroke-linejoin="round" style="filter:drop-shadow(0 0 24px rgba(140,60,255,.6))">'
            '<defs><linearGradient id="ng" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#14C8FF"/>'
            '<stop offset=".5" stop-color="#8B1FE8"/><stop offset="1" stop-color="#FF8A00"/></linearGradient></defs>'
            f'{ICONS[key]}</svg>')


EXTRA_ICONS = {
    "ads": '<circle cx="24" cy="24" r="17"/><circle cx="24" cy="24" r="10"/><circle cx="24" cy="24" r="3"/><path d="M36 12l6-6M38 6h4v4"/>',
    "reels": '<rect x="10" y="5" width="28" height="38" rx="5"/><path d="M21 18l9 6-9 6z"/><path d="M38 14l5-3M38 34l5 3"/>',
    "brand": '<path d="M10 38l8-2 20-20-6-6-20 20z"/><path d="M28 14l6 6"/><circle cx="36" cy="38" r="3"/><circle cx="42" cy="30" r="2"/>',
    "phone": '<path d="M14 6h8l3 9-5 3a24 24 0 0 0 10 10l3-5 9 3v8a4 4 0 0 1-4 4C21 38 10 27 10 10a4 4 0 0 1 4-4z"/>',
    "plan": '<rect x="10" y="6" width="28" height="36" rx="3"/><path d="M16 16h16M16 23h16M16 30h10"/>',
    "rocket": '<path d="M24 6c8 5 11 14 9 24l-9 6-9-6c-2-10 1-19 9-24z"/><circle cx="24" cy="20" r="4"/><path d="M15 30l-5 8 8-2M33 30l5 8-8-2"/>',
}
ICONS.update(EXTRA_ICONS)


def main():
    os.makedirs(POSTS, exist_ok=True)

    # Pinned 1 — launch
    render("P1-launch",
           f'<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding-bottom:120px">'
           f'<div style="font:500 30px Poppins;letter-spacing:12px;opacity:.8">NOW LIVE</div>'
           f'<img src="{MARK}" style="width:430px;margin:50px 0 40px;filter:drop-shadow(0 0 40px rgba(140,60,255,.55))">'
           f'<div style="font:700 104px Poppins;letter-spacing:-2px">ProCore <span class="neon">Media</span></div>'
           f'<div style="font:500 30px Poppins;letter-spacing:12px;opacity:.85;margin-top:18px">CREATIVE AGENCY</div>'
           f'<div class="ar" style="font:700 52px Tajawal;margin-top:60px">حيث يلتقي الإبداع <span class="neon">بالابتكار</span></div></div>')

    # Pinned 2 — services carousel
    render("P2-services-01-cover",
           '<div class="ar" style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:0 90px 140px">'
           '<div style="font:800 190px Tajawal;line-height:1" class="neon">4</div>'
           '<div style="font:800 96px Tajawal;line-height:1.2;margin-top:10px">خدمات…<br>هدف واحد</div>'
           '<div style="font:700 56px Tajawal;margin-top:40px;opacity:.9">نمو علامتك التجارية</div>'
           '<div style="font:500 30px Poppins;letter-spacing:6px;margin-top:70px;opacity:.7;direction:ltr">SWIPE →</div></div>')
    services = [("services", "01", "إدارة السوشيال والتصميم", "خطة شهرية · تصاميم احترافية · نشر منتظم · تفاعل وتقارير"),
                ("ads", "02", "إعلانات Meta", "حملات على <bdi>Facebook</bdi> و <bdi>Instagram</bdi> · استهداف دقيق · متابعة وتقارير واضحة"),
                ("reels", "03", "<bdi>Reels</bdi> وفيديو و <bdi>AI</bdi>", "من الفكرة إلى المونتاج · مشاهد مولّدة بالذكاء الاصطناعي"),
                ("brand", "04", "الهوية البصرية", "شعار · ألوان · خطوط · تطبيقات جاهزة للسوشيال والمطبوعات")]
    for key, n, title, sub in services:
        render(f"P2-services-{int(n)+1:02d}-{key}",
               f'<div class="ar" style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:0 100px 150px">'
               f'<div style="font:600 34px Poppins;letter-spacing:8px;opacity:.6;direction:ltr">{n} / 04</div>'
               f'<div style="margin:60px 0 50px">{icon(key, 300)}</div>'
               f'<div style="font:800 84px Tajawal;line-height:1.25">{title}</div>'
               f'<div style="font:500 40px/1.7 Tajawal;margin-top:36px;opacity:.85">{sub}</div></div>')

    # Pinned 3 — how we start
    steps = [("phone", "1", "استشارة", "مكالمة قصيرة نفهم فيها نشاطك وأهدافك"),
             ("plan", "2", "خطة", "محتوى وإعلانات مخصصة لنشاطك"),
             ("rocket", "3", "تنفيذ", "نشر منتظم وتقرير شهري واضح")]
    rows = "".join(
        f'<div style="display:flex;align-items:center;gap:40px;margin-top:46px">'
        f'<div style="flex:none;width:170px;height:170px;border-radius:50%;border:3px solid #8B1FE8aa;display:grid;place-items:center">{icon(k, 110)}</div>'
        f'<div><div style="font:800 64px Tajawal"><span class="neon">{n}.</span> {t}</div>'
        f'<div style="font:500 38px Tajawal;opacity:.8;margin-top:6px">{s}</div></div></div>' for k, n, t, s in steps)
    render("P3-how-we-start",
           f'<div class="ar" style="position:absolute;inset:0;padding:120px 100px 200px">'
           f'<div style="font:800 92px Tajawal;line-height:1.2">3 خطوات<br><span class="neon">وتبدأ معنا</span></div>{rows}'
           f'<div style="margin-top:70px;display:inline-block;padding:26px 54px;border-radius:999px;background:{NEON};font:800 44px Tajawal">احجز استشارتك عبر واتساب</div></div>')

    # contact sheet
    files = sorted(f for f in os.listdir(POSTS) if f.endswith(".png") and not f.startswith("_"))
    thumbs = [Image.open(os.path.join(POSTS, f)).resize((360, 450)) for f in files]
    sheet = Image.new("RGB", (360 * 4 + 50, 450 * 2 + 30), (30, 30, 30))
    for i, t in enumerate(thumbs):
        sheet.paste(t, (10 + (i % 4) * 370, 10 + (i // 4) * 460))
    sheet.save(os.path.join(POSTS, "_pinned-preview.png"))
    print(files)


if __name__ == "__main__":
    main()
