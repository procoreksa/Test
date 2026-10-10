"""Vivid social templates for ProCore Media (v2 — livelier, higher-energy look).

Renders Day 1 posts to design/agency/out/posts-v2/. Usage: python3 build_vivid.py
"""
import os, subprocess
from PIL import Image
from build_assets import FONT_CSS, CHROME, SRC, OUT
from build_pinned import icon  # noqa: F401  (also registers the extra icons)

POSTS = os.path.join(OUT, "posts-v2")
MARK = os.path.join(OUT, "procore-media-mark-color.png")
W, H = 1080, 1350
YELLOW = "#FFD23F"
WA = "0594943048"

MESHES = {
    "launch": "radial-gradient(at 15% 10%, #2F6BFF 0, transparent 48%), radial-gradient(at 90% 20%, #F2349E 0, transparent 46%), radial-gradient(at 75% 95%, #FF8A00 0, transparent 50%), radial-gradient(at 10% 90%, #8B1FE8 0, transparent 52%), #14052a",
    "blue": "radial-gradient(at 20% 10%, #14C8FF 0, transparent 50%), radial-gradient(at 90% 80%, #2F6BFF 0, transparent 55%), radial-gradient(at 10% 95%, #8B1FE8 0, transparent 50%), #06102e",
    "pink": "radial-gradient(at 85% 10%, #F2349E 0, transparent 50%), radial-gradient(at 10% 70%, #8B1FE8 0, transparent 55%), radial-gradient(at 80% 95%, #FF8A00 0, transparent 45%), #22061f",
    "orange": "radial-gradient(at 15% 15%, #FF8A00 0, transparent 50%), radial-gradient(at 90% 60%, #F2349E 0, transparent 50%), radial-gradient(at 20% 95%, #FFD23F 0, transparent 40%), #2a0d06",
    "purple": "radial-gradient(at 80% 15%, #8B1FE8 0, transparent 55%), radial-gradient(at 10% 40%, #2F6BFF 0, transparent 45%), radial-gradient(at 70% 95%, #F2349E 0, transparent 50%), #12062a",
}

BASE = f"""{FONT_CSS}
html, body {{ width:{W}px; height:{H}px; overflow:hidden; background:#000; }}
.p {{ position:relative; width:{W}px; height:{H}px; overflow:hidden; color:#fff; }}
.noise {{ position:absolute; inset:0; opacity:.18; mix-blend-mode:overlay;
  background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>"); }}
.ar {{ font-family:Tajawal; direction:rtl; }}
.glass {{ background:rgba(255,255,255,.10); border:2px solid rgba(255,255,255,.28); border-radius:36px;
  box-shadow: 0 30px 80px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.35); backdrop-filter: blur(18px); }}
.sticker {{ position:absolute; background:{YELLOW}; color:#111; font:800 38px Poppins; padding:16px 34px; border-radius:999px;
  box-shadow: 0 14px 0 rgba(0,0,0,.25); }}
.hl {{ background:#fff; color:#12052a; padding:0 18px; border-radius:16px; box-decoration-break:clone; -webkit-box-decoration-break:clone; }}
.ring {{ position:absolute; border-radius:50%; border:3px solid rgba(255,255,255,.35); }}
.spark {{ position:absolute; color:#fff; font:700 70px Poppins; text-shadow:0 0 30px rgba(255,255,255,.8); }}
.foot {{ position:absolute; left:60px; right:60px; bottom:50px; display:flex; justify-content:space-between; align-items:center;
  font:600 28px Poppins; }}
.foot .wa {{ display:flex; align-items:center; gap:14px; background:rgba(0,0,0,.35); padding:14px 26px; border-radius:999px; }}
.foot img {{ width:84px; filter: drop-shadow(0 6px 18px rgba(0,0,0,.5)); }}
"""

WA_ICON = ('<svg width="34" height="34" viewBox="0 0 32 32"><path fill="#25D366" d="M16 3a13 13 0 0 0-11.2 19.6L3 29l6.6-1.7A13 13 0 1 0 16 3z"/>'
           '<path fill="#fff" d="M23.3 19.4c-.4-.2-2.3-1.1-2.6-1.2-.4-.1-.6-.2-.9.2l-1.2 1.5c-.2.3-.4.3-.8.1a10.7 10.7 0 0 1-5.3-4.6c-.4-.7.4-.6 1.1-2 .1-.3 0-.5 0-.7l-1.2-2.8c-.3-.7-.6-.6-.9-.6h-.7c-.3 0-.7.1-1 .5-.4.4-1.4 1.3-1.4 3.2s1.4 3.7 1.6 4c.2.3 2.7 4.2 6.6 5.9 2.5 1.1 3.4 1.2 4.7 1 .8-.1 2.3-1 2.6-1.9.3-.9.3-1.7.2-1.9-.1-.2-.4-.3-.8-.5z"/></svg>')


def foot():
    return (f'<div class="foot"><img src="{MARK}"><div class="wa">{WA_ICON}<span>{WA}</span></div>'
            f'<span style="opacity:.9">@procore.media</span></div>')


def deco(seed=0):
    rings = [(-180, -160, 520), (760, 980, 480), (820, -120, 300)]
    sparks = [(120, 260), (900, 420), (180, 1050)]
    s = "".join(f'<div class="ring" style="left:{x}px;top:{y}px;width:{d}px;height:{d}px"></div>' for x, y, d in rings[seed % 2:])
    s += "".join(f'<div class="spark" style="left:{x}px;top:{y}px">✦</div>' for x, y in sparks[: 2 + seed % 2])
    return s


def render(name, mesh, inner, seed=0):
    html = (f'<!doctype html><html><head><meta charset="utf-8"><style>{BASE}</style></head><body>'
            f'<div class="p" style="background:{MESHES[mesh]}">{deco(seed)}<div class="noise"></div>{inner}{foot()}</div></body></html>')
    src = os.path.join(SRC, f"vivid-{name}.html")
    open(src, "w").write(html)
    out = os.path.join(POSTS, f"{name}.png")
    subprocess.run([CHROME, "--headless", "--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--allow-file-access-from-files",
                    "--virtual-time-budget=3000", f"--window-size={W},{H + 200}", f"--screenshot={out}", "file://" + src],
                   capture_output=True)
    img = Image.open(out).convert("RGB").crop((0, 0, W, H))
    img.save(out.replace(".png", ".jpg"), quality=92)  # Instagram needs JPEG
    os.remove(out)
    print("rendered", name)


def big_icon(key, size=230):
    return (f'<div class="glass" style="width:{size+90}px;height:{size+90}px;display:grid;place-items:center;border-radius:48px">'
            f'<svg viewBox="0 0 48 48" width="{size}" height="{size}" fill="none" stroke="#fff" stroke-width="2.6" '
            f'stroke-linecap="round" stroke-linejoin="round" style="filter:drop-shadow(0 0 22px rgba(255,255,255,.55))">'
            f'{__import__("build_assets").ICONS[key]}</svg></div>')


def chips(items):
    return "".join(f'<span class="glass" style="display:inline-block;padding:14px 30px;margin:10px;border-radius:999px;font:700 36px Tajawal">{i}</span>' for i in items)


def main():
    os.makedirs(POSTS, exist_ok=True)

    # D1-P1 — launch
    render("D1-P1-launch", "launch",
           f'<div class="sticker" style="top:110px;left:80px;transform:rotate(-8deg)">NOW LIVE 🚀</div>'
           f'<img src="{MARK}" style="position:absolute;top:150px;right:110px;width:520px;transform:rotate(8deg);'
           f'filter:drop-shadow(0 40px 60px rgba(0,0,0,.55)) drop-shadow(0 0 60px rgba(255,255,255,.25))">'
           f'<div class="ar" style="position:absolute;right:80px;left:80px;top:720px">'
           f'<div style="font:800 128px/1.1 Tajawal">انطلقنا<span style="color:{YELLOW}">!</span></div>'
           f'<div style="font:800 76px/1.35 Tajawal;margin-top:10px"><span class="hl">ProCore Media</span></div>'
           f'<div style="font:700 50px/1.5 Tajawal;margin-top:26px;opacity:.95">إبداع · ذكاء اصطناعي · نتائج تُقاس</div></div>', seed=0)

    # D1-P2 — services carousel
    render("D1-P2-01-cover", "purple",
           '<div class="ar" style="position:absolute;inset:0;padding:150px 80px 0;text-align:center">'
           '<div style="font:800 330px/1 Poppins;color:#fff;text-shadow:0 20px 60px rgba(0,0,0,.45)">4</div>'
           '<div style="font:800 104px/1.25 Tajawal;margin-top:20px">خدمات <span class="hl">تكبّر</span><br>علامتك</div>'
           f'<div class="sticker" style="position:relative;display:inline-block;margin-top:70px;transform:rotate(-3deg);font-family:Tajawal">اسحب ← وشوفها</div></div>', seed=1)
    slides = [("services", "blue", "01", "إدارة السوشيال<br>والتصميم", ["خطة شهرية", "تصاميم احترافية", "تفاعل وتقارير"]),
              ("ads", "pink", "02", "إعلانات <bdi>Meta</bdi>", ["استهداف دقيق", "إعلانات تبيع", "تقارير واضحة"]),
              ("reels", "orange", "03", "<bdi>Reels</bdi> وفيديو<br>و <bdi>AI</bdi>", ["فكرة", "إنتاج بالذكاء الاصطناعي", "مونتاج"]),
              ("brand", "launch", "04", "الهوية البصرية", ["شعار", "ألوان وخطوط", "تطبيقات جاهزة"])]
    for i, (key, mesh, n, title, items) in enumerate(slides):
        render(f"D1-P2-{i+2:02d}-{key}", mesh,
               f'<div style="position:absolute;top:90px;left:80px;font:800 150px Poppins;color:rgba(255,255,255,.22)">{n}</div>'
               f'<div class="ar" style="position:absolute;inset:0;padding:190px 80px 0;display:flex;flex-direction:column;align-items:center;text-align:center">'
               f'{big_icon(key, 220)}<div style="font:800 100px/1.2 Tajawal;margin-top:60px">{title}</div>'
               f'<div style="margin-top:40px">{chips(items)}</div></div>', seed=i)

    # D1-P4 — how we start (CTA)
    steps = [("01", "استشارة", "نفهم نشاطك وأهدافك"), ("02", "خطة", "محتوى وإعلانات مخصصة"), ("03", "تنفيذ", "نشر منتظم وتقرير شهري")]
    cards = "".join(
        f'<div class="glass" style="display:flex;align-items:center;gap:36px;padding:22px 44px;margin-top:20px;transform:translateX({-i*30}px)">'
        f'<div style="font:800 96px Poppins;color:{YELLOW};direction:ltr">{n}</div>'
        f'<div><div style="font:800 66px Tajawal">{t}</div><div style="font:500 40px Tajawal;opacity:.9">{s}</div></div></div>'
        for i, (n, t, s) in enumerate(steps))
    render("D1-P4-how-we-start", "pink",
           f'<div class="ar" style="position:absolute;inset:0;padding:80px 80px 0">'
           f'<div style="font:800 88px/1.2 Tajawal">3 خطوات<br><span class="hl">وتبدأ معنا</span></div>{cards}'
           f'<div style="margin-top:34px;display:inline-flex;align-items:center;gap:20px;background:{YELLOW};color:#111;'
           f'font:800 50px Tajawal;padding:26px 50px;border-radius:999px;box-shadow:0 14px 0 rgba(0,0,0,.25)">احجز استشارتك الآن</div></div>', seed=1)

    files = sorted(f for f in os.listdir(POSTS) if f.endswith(".jpg"))
    thumbs = [Image.open(os.path.join(POSTS, f)).resize((300, 375)) for f in files]
    sheet = Image.new("RGB", (310 * 4 + 10, 385 * 2 + 10), (20, 20, 20))
    for i, t in enumerate(thumbs):
        sheet.paste(t, (10 + (i % 4) * 310, 10 + (i // 4) * 385))
    sheet.save(os.path.join(POSTS, "_preview.png"))
    print(files)


if __name__ == "__main__":
    main()
