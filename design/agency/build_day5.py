"""Day 5 (Thu 2026-10-15) posts in the v3 photo style + behind-the-scenes Reel.

Photos: design/agency/photos/{brandboard,desk,audit,perfume,cover2}.jpg (Canva AI) and our own
earlier post designs (internal work) for the behind-the-scenes Reel.
Outputs: out/posts-v3/D5-*.jpg and out/posts-v3/D5-P3-bts-reel.mp4 (+ -cover.jpg).
Usage: python3 build_day5.py
"""
import os, subprocess
from PIL import Image
from build_photo_posts import render, bottom, PHOTOS, POSTS
from build_vivid import YELLOW, WA
from build_reel_launch import shot, ease, ease_out_back, place, TMP
from build_day4 import ad_card

BOX = 'background:rgba(255,255,255,.14);border:2px solid rgba(255,255,255,.3);border-radius:32px;padding:26px 36px;'
CONCEPT = ('<div style="position:absolute;top:40px;left:44px;font:700 24px Poppins;color:#111;background:{y};padding:10px 20px;'
           'border-radius:999px;z-index:5">Concept · <span class="ar">إعلان تجريبي</span></div>').format(y=YELLOW)


def rows(items):
    return "".join(f'<div style="margin-top:22px;{BOX}font:700 44px/1.5 Tajawal;text-align:right">{e} {t}</div>' for e, t in items)


def posts():
    # 5.1 A/B reveal carousel (follow-up to Wednesday's poll)
    a = ad_card("A", '<div style="position:absolute;inset:0;background:rgba(200,0,60,.35)"></div>'
                '<div class="ar" style="position:absolute;top:120px;left:0;right:0;text-align:center;font:800 54px/1.15 Tajawal;color:#FFEB3B;'
                'text-shadow:3px 3px 0 #d00">عرض!!! خصم!!!<br>لا يفوتك 🔥🔥</div>'
                '<div style="position:absolute;inset:0;background:rgba(0,0,0,.45)"></div>', "#FF5A5F")
    b = ad_card("B", '<div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0) 55%,rgba(0,0,0,.75))"></div>'
                '<div class="ar" style="position:absolute;bottom:60px;left:0;right:0;text-align:center;color:#fff">'
                '<div style="font:800 54px/1.3 Tajawal">عطر يترك أثر</div>'
                f'<div style="font:600 30px Tajawal;margin-top:8px;color:{YELLOW}">اكتشفه الحين ←</div></div>', "#14C8FF")
    render("D5-P1-01-reveal", mesh="blue", seed=1, inner=CONCEPT +
           '<div class="ar" style="position:absolute;top:110px;left:0;right:0;text-align:center">'
           '<div style="font:700 46px Tajawal;opacity:.9">جواب سؤال أمس 👀</div>'
           f'<div style="font:800 110px/1.25 Tajawal">الأفضل: <span class="hl" style="padding:8px 26px 2px"><bdi>B</bdi></span> ✅</div></div>'
           f'<div style="position:absolute;top:400px;left:0;right:0;display:flex;justify-content:center;align-items:center;gap:40px">'
           f'<div style="transform:scale(.8);opacity:.75">{a}</div>{b}</div>'
           '<div class="ar" style="position:absolute;bottom:150px;left:0;right:0;text-align:center;font:700 44px Tajawal">اسحب وشوف ليش ←</div>')
    render("D5-P1-02-why-b", mesh="purple", seed=2, inner=
           '<div class="ar" style="position:absolute;inset:0;padding:140px 80px 0">'
           f'<div style="font:800 92px/1.3 Tajawal;text-align:center">ليش <bdi>B</bdi> <span style="color:{YELLOW}">يبيع</span> أكثر؟</div>'
           + rows([("🎯", "رسالة وحدة واضحة"), ("🌬️", "مساحة تخلي المنتج يتنفّس"), ("👉", "دعوة وحدة للعمل"), ("✨", "يحسسك إن المنتج فاخر")]) + '</div>')
    render("D5-P1-03-whats-wrong-a", mesh="pink", seed=3, inner=
           '<div class="ar" style="position:absolute;inset:0;padding:140px 80px 0">'
           '<div style="font:800 92px/1.3 Tajawal;text-align:center">طيب <bdi>A</bdi> وش مشكلته؟ 🤔</div>'
           + rows([("❌", "زحمة كلام = تشتيت"), ("❌", "ألوان كثيرة = إحساس رخيص"), ("❌", "كل شي مهم = ولا شي مهم")])
           + f'<div style="text-align:center;margin-top:50px"><span style="display:inline-block;background:{YELLOW};color:#111;font:800 46px Tajawal;'
             'padding:22px 46px;border-radius:999px;box-shadow:0 12px 0 rgba(0,0,0,.25)">تبي نراجع إعلاناتك؟ كلمنا</span></div></div>')

    # 5.2 visual identity service
    render("D5-P2-identity", photo="brandboard.jpg", inner=
           f'<div class="sticker" style="top:90px;right:60px;transform:rotate(5deg);font-family:Tajawal">الهوية البصرية 🎨</div>'
           + bottom('<div style="font:800 86px/1.25 Tajawal">هويتك تتكلم عنك…</div>'
                    f'<div style="font:800 60px/1.5 Tajawal;margin-top:6px">قبل لا <span style="color:{YELLOW}">تتكلم</span> 😎</div>'
                    '<div style="margin-top:18px"><span class="chip">شعار</span><span class="chip">ألوان</span><span class="chip">خطوط</span>'
                    '<span class="chip">تطبيقات جاهزة</span></div>', pad=140))

    # 5.4 free audit offer
    render("D5-P4-free-audit", photo="audit.jpg", inner=
           f'<div class="sticker" style="top:90px;right:60px;transform:rotate(5deg);font-family:Tajawal">عرض الإطلاق 🎁</div>'
           + bottom('<div style="font:800 84px/1.25 Tajawal">مراجعة <span class="hl" style="padding:6px 18px 0">مجانية</span><br>لحسابك 🔍</div>'
                    '<div style="font:700 46px/1.5 Tajawal;margin-top:14px">+ 3 توصيات تطبقها على طول</div>'
                    f'<div style="font:700 38px Tajawal;margin-top:8px;color:{YELLOW}">لأول 10 منشآت فقط</div>'
                    f'<div style="margin-top:22px;display:inline-block;background:{YELLOW};color:#111;font:800 44px Tajawal;padding:18px 40px;'
                    'border-radius:999px;box-shadow:0 12px 0 rgba(0,0,0,.25)">أرسل رابط حسابك واتساب</div>', pad=140))


def reel():
    """18s behind-the-scenes Reel: idea → AI photo → design → schedule → live. Uses our own (internal) work."""
    W, H, FPS, DUR = 1080, 1920, 30, 18.0
    dest = os.path.join(POSTS, "D5-P3-bts-reel.mp4")
    os.makedirs(TMP, exist_ok=True)
    im = Image.open(os.path.join(PHOTOS, "desk.jpg")).convert("RGB")
    s = max(W / im.width, H / im.height) * 1.1
    bg = im.resize((int(im.width * s), int(im.height * s)), Image.LANCZOS)
    dim = Image.new("RGBA", (W, H), (10, 3, 24, 120))

    def card(path, w):
        c = Image.open(path).convert("RGB")
        c = c.resize((w, int(c.height * w / c.width)), Image.LANCZOS).convert("RGBA")
        frame = Image.new("RGBA", (c.width + 16, c.height + 16), (255, 255, 255, 255))
        frame.alpha_composite(c, (8, 8))
        return frame
    photo = card(os.path.join(PHOTOS, "cover2.jpg"), 560)
    design = card(os.path.join(POSTS, "D2-P1-01-cover.jpg"), 560)

    T = 'class="ar" style="text-align:center;font:800 {s}px/1.35 Tajawal;color:#fff;text-shadow:0 6px 30px rgba(0,0,0,.85)"'
    hook = shot("d5-hook", 1000, 300, f'<div {T.format(s=80)}>كيف يطلع منشور<br>من عندنا؟ 🛠️</div>')
    step = lambda n, t: shot(f"d5-s{n}", 1040, 170, f'<div class="ar" style="margin:20px;display:inline-flex;align-items:center;gap:22px;'
                             f'background:rgba(20,5,42,.8);border:3px solid {YELLOW};border-radius:999px;padding:14px 40px;color:#fff;white-space:nowrap;'
                             f'font:800 54px Tajawal"><span style="font:800 60px Poppins;color:{YELLOW}">{n}</span>{t}</div>')
    steps = [step(1, "فكرة وبحث 💡"), step(2, "صورة بالذكاء الاصطناعي 🤖"), step(3, "تصميم ولهجة سعودية 🎨"),
             step(4, "جدولة في الوقت الصح 📅"), step(5, "ونشر ✅")]
    sched = shot("d5-sched", 760, 300, '<div class="ar" style="margin:20px;background:#fff;color:#111;border-radius:30px;padding:30px 40px;'
                 'box-shadow:0 20px 60px rgba(0,0,0,.5)"><div style="font:800 46px Tajawal">📅 الاثنين · 09:00</div>'
                 '<div style="font:600 34px/1.6 Tajawal;color:#555;margin-top:8px">إنستغرام + فيسبوك · مجدول ✅</div></div>')
    tag = shot("d5-tag", 520, 110, '<div style="font:600 28px Poppins;color:#fff;background:rgba(0,0,0,.5);padding:10px 24px;'
               'border-radius:999px;display:inline-block;margin:16px"><span class="ar">من شغلنا الداخلي على حسابنا</span></div>')
    cta = shot("d5-cta", 1000, 200, f'<div style="text-align:center;padding-top:20px"><span class="ar" style="display:inline-block;background:{YELLOW};'
               f'color:#111;font:800 52px Tajawal;padding:24px 50px;border-radius:999px;box-shadow:0 14px 0 rgba(0,0,0,.25)">'
               f'تبي نسوي كذا لنشاطك؟ {WA}</span></div>')

    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
           "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-t", str(DUR),
           "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-pix_fmt", "yuv420p",
           "-c:a", "aac", "-b:a", "128k", "-shortest", "-movflags", "+faststart", dest]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    # (start, end) for each step label and its visual
    win = [(2.6, 5.2), (5.2, 8.0), (8.0, 10.8), (10.8, 13.4), (13.4, 15.0)]
    for i in range(int(DUR * FPS)):
        t = i / FPS
        z = 1.0 + 0.08 * t / DUR
        cw, ch = int(W / z), int(H / z)
        ox, oy = (bg.width - cw) // 2, (bg.height - ch) // 2
        fr = bg.crop((ox, oy, ox + cw, oy + ch)).resize((W, H), Image.BICUBIC).convert("RGBA")
        if t > 2.4:
            fr.alpha_composite(dim)
        place(fr, tag, W / 2, 90)
        place(fr, hook, W / 2, 960, scale=0.9 + 0.1 * ease_out_back(t / 0.6), alpha=ease(t / 0.4) * (1 - ease((t - 2.2) / 0.4)))
        for k, (st, en) in enumerate(win):
            a = ease((t - st) / 0.3) * (1 - ease((t - en + 0.3) / 0.3)) if k < 4 else ease((t - st) / 0.3) * (1 - ease((t - 15.0) / 0.4))
            place(fr, steps[k], W / 2, 330, scale=0.9 + 0.1 * ease_out_back((t - st) / 0.5), alpha=a)
        st, en = win[1]
        place(fr, photo, W / 2, 1020, scale=0.85 + 0.15 * ease((t - st) / 0.6), angle=-4,
              alpha=ease((t - st) / 0.4) * (1 - ease((t - en + 0.3) / 0.3)))
        st, en = win[2]
        place(fr, design, W / 2, 1020, scale=0.85 + 0.15 * ease((t - st) / 0.6), angle=3,
              alpha=ease((t - st) / 0.4) * (1 - ease((t - win[4][1]) / 0.4)))
        st, en = win[3]
        place(fr, sched, W / 2, 1560, scale=ease_out_back((t - st) / 0.5), alpha=ease((t - st) / 0.3) * (1 - ease((t - 15.0) / 0.4)))
        place(fr, cta, W / 2, 1000, scale=ease_out_back((t - 15.4) / 0.6), alpha=ease((t - 15.4) / 0.3))
        out = fr.convert("RGB")
        fade = min(1.0, t / 0.3, (DUR - t) / 0.4)
        if fade < 1:
            out = Image.blend(Image.new("RGB", (W, H)), out, max(0.0, fade))
        p.stdin.write(out.tobytes())
    p.stdin.close()
    p.wait()
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", "9.5", "-i", dest, "-frames:v", "1", "-q:v", "2",
                    dest.replace(".mp4", "-cover.jpg")])
    print("ok", dest)


if __name__ == "__main__":
    os.makedirs(POSTS, exist_ok=True)
    posts()
    reel()
    files = sorted(f for f in os.listdir(POSTS) if f.startswith("D5") and f.endswith(".jpg"))
    thumbs = [Image.open(os.path.join(POSTS, f)).resize((300, 375)) for f in files]
    sheet = Image.new("RGB", (310 * len(thumbs) + 10, 395), (20, 20, 20))
    for i, t in enumerate(thumbs):
        sheet.paste(t, (10 + i * 310, 10))
    sheet.save(os.path.join(POSTS, "_preview-day5.png"))
    print(files)
