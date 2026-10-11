"""Creative builder for PCM-CHATGPT-LAUNCH-2026-10 (28 posts). Usage: python3 build_campaign.py [P01 P02 ...]"""
import os, sys
from PIL import Image
from pcm import (render, shot, logo_layer, screen, place, ease, ease_out_back, encode, cover_from, fit, kb,
                 PHOTOS, OUT, YELLOW, WA, concept_badge, GRAD)

BUILD = {}


def post(fn):
    BUILD[fn.__name__.upper()] = fn
    return fn


def block(html, bottom=150, align="right"):
    return f'<div class="ar" style="position:absolute;left:70px;right:70px;bottom:{bottom}px;text-align:{align}">{html}</div>'


def chips(items, size=30):
    return "".join(f'<span class="chip" style="font-size:{size}px">{t}</span>' for t in items)


def h(text, size=96, lh=1.2, extra=""):
    return f'<div style="font:800 {size}px/{lh} Tajawal;{extra}">{text}</div>'


def sub(text, size=40, extra=""):
    return f'<div style="font:700 {size}px/1.55 Tajawal;color:#dfe4f5;margin-top:14px;{extra}">{text}</div>'


def swipe(txt="اسحب ←"):
    return f'<div class="ar" style="position:absolute;top:60px;left:44px;font:700 26px Tajawal;padding:8px 20px;border-radius:999px;background:rgba(255,255,255,.12)">{txt}</div>'


def pager(i, n):
    return (f'<div style="position:absolute;top:70px;left:44px;font:700 26px Poppins;color:#c9cfe6">'
            f'<span class="gt">{i:02d}</span> / {n:02d}</div>')


# ------------------------------------------------------------------ Day 1
@post
def p01():
    render("P01-launch", photo="p01_launch.jpg", photo_h=930, inner=block(
        '<div style="font:700 30px Tajawal;color:#7FD6FF">وكالة إبداعية في السعودية 🇸🇦</div>'
        + h('انطلقنا <span class="gt">رسميًا</span> 🚀', 112, 1.25)
        + sub("نحوّل الأفكار الجريئة إلى تجارب رقمية مؤثرة"), bottom=170))


SERVICES = [
    ("s_ai.jpg", "صناعة محتوى", "بالذكاء الاصطناعي", ["صور إعلانية", "أفكار محتوى", "تصاميم أسرع"]),
    ("s_cine.jpg", "إنتاج فيديوهات", "سينمائية", ["ريلز", "إعلانات فيديو", "موشن جرافيك"]),
    ("s_brand.jpg", "تصميم الهويات", "والعلامات التجارية", ["شعار", "ألوان وخطوط", "تطبيقات جاهزة"]),
    ("s_ads.jpg", "التسويق الرقمي", "والحملات الإعلانية", ["استهداف", "إعلانات ممولة", "تقارير واضحة"]),
    ("s_social.jpg", "إدارة وصناعة محتوى", "السوشيال ميديا", ["خطة شهرية", "تصميم ونشر", "تفاعل مع الجمهور"]),
]


@post
def p02():
    rows = "".join(
        f'<div class="card ar" style="display:flex;align-items:center;gap:26px;padding:16px 30px;margin-top:14px">'
        f'<div class="num gt" style="font-size:52px;min-width:80px">{i:02d}</div>'
        f'<div style="font:800 38px/1.3 Tajawal">{a} {b}</div></div>'
        for i, (_, a, b, _c) in enumerate(SERVICES, 1))
    render("P02-1", seed=0, logo_center=True, inner=
           '<div class="ar" style="position:absolute;left:80px;right:80px;top:270px;text-align:center">'
           + h('وش <span class="gt">نقدّم</span> لك؟', 110) + sub("كل اللي تحتاجه علامتك… في مكان واحد")
           + f'<div style="text-align:right;margin-top:26px">{rows}</div>'
           + '<div style="font:700 32px Tajawal;margin-top:30px;color:#c9cfe6">اسحب وتعرّف على كل خدمة ←</div></div>')
    for i, (photo, a, b, c) in enumerate(SERVICES, 1):
        render(f"P02-{i + 1}", photo=photo, photo_h=900, inner=pager(i, 5) + block(
            f'<div class="num gt" style="font-size:90px;line-height:1">{i:02d}</div>'
            + h(a, 86, 1.2, "margin-top:10px") + h(f'<span class="gt">{b}</span>', 74, 1.3)
            + f'<div style="margin-top:20px">{chips(c)}</div>', bottom=160))


@post
def p03():
    W, H, FPS, DUR = 1080, 1920, 30, 15.0
    shots = [fit(os.path.join(PHOTOS, f)) for f in ("r_idea.jpg", "r_design.jpg", "r_impact.jpg")]
    T = 'class="ar" style="text-align:center;color:#fff;text-shadow:0 6px 30px rgba(0,0,0,.85)"'
    titles = [shot("p03-t1", 1000, 260, f'<div {T}><div style="font:800 110px/1.2 Tajawal">الفكرة 💡</div></div>'),
              shot("p03-t2", 1000, 260, f'<div {T}><div style="font:800 110px/1.2 Tajawal">التنفيذ 🎨</div></div>'),
              shot("p03-t3", 1000, 260, f'<div {T}><div style="font:800 110px/1.2 Tajawal">الأثر 🚀</div></div>')]
    subs = [shot("p03-s1", 1000, 140, f'<div {T}><div style="font:700 48px Tajawal">نسمع هدفك ونطوّر الفكرة</div></div>'),
            shot("p03-s2", 1000, 140, f'<div {T}><div style="font:700 48px Tajawal">نصنع المحتوى بأعلى جودة</div></div>'),
            shot("p03-s3", 1000, 140, f'<div {T}><div style="font:700 48px Tajawal">ونراجع الأداء ونحسّن</div></div>')]
    hook = shot("p03-hook", 1000, 300, f'<div {T}><div style="font:800 92px/1.3 Tajawal">من فكرة…<br>إلى <span style="color:#FFD23F">أثر</span></div></div>')
    slogan = shot("p03-slogan", 1000, 220, f'<div {T}><div style="font:800 58px/1.5 Tajawal">حيث يلتقي الإبداع بالابتكار</div>'
                  f'<div style="font:600 24px Poppins;letter-spacing:6px;margin-top:6px">WHERE CREATIVITY MEETS INNOVATION</div></div>')
    cta = shot("p03-cta", 1000, 170, '<div style="text-align:center;padding-top:20px"><span class="btn ar">وش فكرتك؟ شاركنا 👇</span></div>')
    lg = logo_layer(620)
    shade = Image.new("RGBA", (W, H))
    for y in range(H):
        shade.paste((5, 8, 23, int(200 * max(0.0, (y - H * 0.45) / (H * 0.55)) ** 1.2)), (0, y, W, y + 1))
    seg = [(0.0, 4.6), (4.6, 8.4), (8.4, 11.6)]

    def frames():
        for i in range(int(DUR * FPS)):
            t = i / FPS
            if t < 11.6:
                k = 0 if t < 4.6 else (1 if t < 8.4 else 2)
                st, en = seg[k]
                fr = kb(shots[k], 1.0 + 0.08 * (t - st) / (en - st))
                if k > 0 and t - st < 0.5:
                    prev = kb(shots[k - 1], 1.08)
                    fr = Image.blend(prev, fr, ease((t - st) / 0.5))
                fr = fr.convert("RGBA")
                fr.alpha_composite(shade)
                if t < 1.8:
                    place(fr, hook, W / 2, 1380, scale=0.9 + 0.1 * ease_out_back(t / 0.6), alpha=ease(t / 0.4) * (1 - ease((t - 1.5) / 0.3)))
                a = ease((t - st - (1.8 if k == 0 else 0.3)) / 0.4) * (1 - ease((t - en + 0.3) / 0.3))
                place(fr, titles[k], W / 2, 1360, alpha=a, scale=0.95 + 0.05 * ease(a))
                place(fr, subs[k], W / 2, 1520, alpha=a)
                out = fr.convert("RGB")
            else:
                out = Image.new("RGB", (W, H), (5, 8, 23))
                g = Image.new("RGBA", (W, H))
                fr = out.convert("RGBA")
                a = ease((t - 11.6) / 0.6)
                l = lg.copy()
                l.putalpha(l.getchannel("A").point(lambda v: int(v * a)))
                fr.alpha_composite(l, ((W - l.width) // 2, 500))
                place(fr, slogan, W / 2, 1190, alpha=ease((t - 12.2) / 0.5))
                place(fr, cta, W / 2, 1420, scale=ease_out_back((t - 12.8) / 0.6), alpha=ease((t - 12.8) / 0.3))
                out = fr.convert("RGB")
            fade = min(1.0, t / 0.3, (DUR - t) / 0.4)
            if fade < 1:
                out = Image.blend(Image.new("RGB", (W, H)), out, max(0.0, fade))
            yield out
    dest = os.path.join(OUT, "P03-reel.mp4")
    encode(frames(), dest, FPS, DUR)
    cover_from(dest, 2.6, os.path.join(OUT, "P03-reel-cover.jpg"))
    print("reel", dest)


@post
def p04():
    render("P04-contact", photo="p04_chat.jpg", photo_h=900, inner=block(
        h('مشروعك الجاي<br>يبدأ <span class="gt">برسالة</span> ✨', 100, 1.25)
        + sub("تواصل معنا ونسمع فكرتك")
        + f'<div style="margin-top:16px">{chips(["نسمع فكرتك", "نفهم احتياجك", "نقترح حلول إبداعية"])}</div>'
        + f'<div style="margin-top:26px;display:flex;align-items:center;gap:24px;justify-content:flex-start">'
          f'<span class="btn">راسلنا الآن</span><span style="font:700 38px Poppins;direction:ltr">{WA}</span></div>', bottom=150))


# ------------------------------------------------------------------ helpers for review
def sheet(prefix, cols=6):
    files = sorted(f for f in os.listdir(OUT) if f.startswith(prefix) and f.endswith(".jpg"))
    th = [Image.open(os.path.join(OUT, f)).resize((300, int(300 * Image.open(os.path.join(OUT, f)).height / 1080))) for f in files]
    rows = (len(th) + cols - 1) // cols
    hmax = max(t.height for t in th)
    s = Image.new("RGB", (310 * cols + 10, (hmax + 10) * rows + 10), (20, 20, 20))
    for i, t in enumerate(th):
        s.paste(t, (10 + (i % cols) * 310, 10 + (i // cols) * (hmax + 10)))
    path = os.path.join(OUT, f"_sheet-{prefix}.png")
    s.save(path)
    return path


if __name__ == "__main__":
    for k in (sys.argv[1:] or list(BUILD)):
        BUILD[k.upper()]()
