"""Day 3 (Tue 2026-10-13) posts in the v3 photo style + "3 ways we use AI" Reel.

Photos: design/agency/photos/{reach3,ads3,barista,cafefront,studio}.jpg (Canva AI).
Outputs: out/posts-v3/D3-*.jpg and out/posts-v3/D3-P3-ai-3-ways-reel.mp4 (+ -cover.jpg).
Usage: python3 build_day3.py
"""
import os, subprocess
from PIL import Image
from build_photo_posts import render, bottom, PHOTOS, POSTS
from build_vivid import YELLOW, WA
from build_reel_launch import shot, ease, ease_out_back, place, TMP

CONCEPT = ('<div style="position:absolute;top:40px;left:44px;font:700 24px Poppins;color:#111;background:{y};padding:10px 20px;'
           'border-radius:999px;z-index:5">Concept Project · <span class="ar">مشروع تصوري</span></div>').format(y=YELLOW)
BOX = 'background:rgba(255,255,255,.14);border:2px solid rgba(255,255,255,.3);border-radius:32px;padding:30px 40px;'


def posts():
    # 3.1 carousel — Reach vs Impressions
    render("D3-P1-01-cover", photo="reach3.jpg", inner=
           f'<div class="sticker" style="top:90px;right:60px;transform:rotate(5deg);font-family:Tajawal">اسحب ←</div>'
           + bottom('<div style="font:800 92px/1.2 Poppins"><bdi>Reach</bdi> <span style="font-family:Tajawal">ولا</span></div>'
                    f'<div style="font:800 92px/1.3 Poppins;direction:ltr;text-align:right;color:{YELLOW}">Impressions? 🤔</div>'
                    '<div style="font:700 48px/1.6 Tajawal;margin-top:16px">الفرق اللي يغيّر قراءتك <span class="hl" style="padding:12px 16px 4px;line-height:1.9">لأرقامك</span></div>'))
    render("D3-P1-02-reach", mesh="blue", seed=1, inner=
           '<div class="ar" style="position:absolute;inset:0;padding:170px 80px 0;text-align:center">'
           '<div style="font:800 200px/1 Tajawal">👥</div>'
           '<div style="font:800 110px/1.3 Poppins;margin-top:30px">Reach</div>'
           '<div style="font:800 76px/1.4 Tajawal;margin-top:10px">= كم <span class="hl" style="padding:4px 16px 0">شخص</span> شافك</div>'
           f'<div style="margin-top:50px;display:inline-block;{BOX}font:700 46px/1.6 Tajawal">100 شخص شافوا منشورك<br>= <bdi>Reach 100</bdi></div></div>')
    render("D3-P1-03-impressions", mesh="pink", seed=2, inner=
           '<div class="ar" style="position:absolute;inset:0;padding:170px 80px 0;text-align:center">'
           '<div style="font:800 200px/1 Tajawal">👁️</div>'
           '<div style="font:800 100px/1.3 Poppins;margin-top:30px">Impressions</div>'
           '<div style="font:800 72px/1.4 Tajawal;margin-top:10px">= كم <span class="hl" style="padding:4px 16px 0">مرة</span> انشاف منشورك</div>'
           f'<div style="margin-top:50px;display:inline-block;{BOX}font:700 46px/1.6 Tajawal">شخص واحد شافه 3 مرات<br>= <bdi>Reach 1 · Impressions 3</bdi></div></div>')
    render("D3-P1-04-why", mesh="purple", seed=3, inner=
           '<div class="ar" style="position:absolute;inset:0;padding:150px 80px 0;text-align:center">'
           '<div style="font:800 96px/1.3 Tajawal">طيب ليش <span class="hl" style="padding:4px 18px 0">يهمك</span>؟ 🧐</div>'
           f'<div style="margin-top:50px;{BOX}font:700 46px/1.6 Tajawal;text-align:right">✅ <bdi>Reach</bdi> يزيد<br>= توصل لناس جدد</div>'
           f'<div style="margin-top:26px;{BOX}font:700 46px/1.6 Tajawal;text-align:right">⚠️ <bdi>Impressions</bdi> تزيد بس <bdi>Reach</bdi> ثابت<br>= تعيد نفسك لنفس الناس</div>'
           f'<div style="margin-top:50px;display:inline-block;background:{YELLOW};color:#111;font:800 48px Tajawal;padding:22px 50px;'
           'border-radius:999px;box-shadow:0 12px 0 rgba(0,0,0,.25)">احفظ البوست 📌</div></div>')

    # 3.2 Meta ads service
    render("D3-P2-meta-ads", photo="ads3.jpg", inner=
           f'<div class="sticker" style="top:90px;right:60px;transform:rotate(5deg);font-family:Tajawal">إعلانات <bdi>Meta</bdi> 🎯</div>'
           + bottom('<div style="font:800 80px/1.25 Tajawal">إعلانك يصرف…<br>وما يجيب نتيجة؟ 😬</div>'
                    f'<div style="font:800 60px/1.5 Tajawal;margin-top:10px">خلّه <span style="color:{YELLOW}">علينا</span> 💪</div>'
                    '<div style="margin-top:18px"><span class="chip">جمهور صح</span><span class="chip">تصاميم تبيع</span>'
                    '<span class="chip">متابعة يومية</span><span class="chip">تقرير واضح</span></div>', pad=140))

    # 3.4 concept carousel — cafe opening (clearly labelled concept, not a client)
    render("D3-P4-01-concept-cover", photo="cafefront.jpg", inner=CONCEPT
           + bottom('<div style="font:700 44px Tajawal;opacity:.9">تخيّلنا حملة افتتاح لـ</div>'
                    '<div style="font:800 96px/1.25 Tajawal;margin-top:8px">مقهى مختص ☕</div>'
                    f'<div style="font:700 46px/1.6 Tajawal;margin-top:16px">نموذج إبداعي يوضح أسلوبنا <span style="color:{YELLOW}">(مو لعميل)</span></div>'))
    render("D3-P4-02-concept-ad", photo="barista.jpg", inner=CONCEPT
           + bottom('<div style="font:800 96px/1.2 Tajawal">كل كوب<br>له <span style="color:#FFD23F">حكاية</span> ☕</div>'
                    '<div style="margin-top:22px"><span class="chip">الافتتاح قريب</span><span class="chip">أول كوب علينا 🎁</span></div>'
                    '<div style="font:600 34px Tajawal;margin-top:18px;opacity:.8">↑ نموذج لإعلان الحملة</div>'))
    render("D3-P4-03-concept-plan", mesh="orange", seed=4, inner=CONCEPT +
           '<div class="ar" style="position:absolute;inset:0;padding:160px 80px 0;text-align:right">'
           '<div style="font:800 88px/1.3 Tajawal;text-align:center">وش الفكرة؟ 💡</div>'
           + "".join(f'<div style="margin-top:26px;{BOX}font:700 44px/1.5 Tajawal"><span style="color:{YELLOW}">{k}:</span> {v}</div>'
                     for k, v in [("🎯 الهدف", "زيارات في أول أسبوع"), ("💬 الرسالة", "وحدة وواضحة: أول كوب علينا"),
                                  ("📱 القنوات", "ريلز + ستوري + إعلان ممول")])
           + f'<div style="text-align:center;margin-top:46px"><span style="display:inline-block;background:{YELLOW};color:#111;font:800 48px Tajawal;'
             'padding:22px 50px;border-radius:999px;box-shadow:0 12px 0 rgba(0,0,0,.25)">تبي حملة لنشاطك؟ كلمنا</span></div></div>')


def reel():
    """15s "3 ways we use AI" Reel on the studio photo, 1080x1920."""
    W, H, FPS, DUR = 1080, 1920, 30, 15.0
    dest = os.path.join(POSTS, "D3-P3-ai-3-ways-reel.mp4")
    os.makedirs(TMP, exist_ok=True)
    im = Image.open(os.path.join(PHOTOS, "studio.jpg")).convert("RGB")
    s = max(W / im.width, H / im.height) * 1.1
    bg = im.resize((int(im.width * s), int(im.height * s)), Image.LANCZOS)
    shade = Image.new("RGBA", (W, H))
    for y in range(H):
        a = int(225 * max(0.0, (y - H * 0.4) / (H * 0.6)) ** 1.1)
        shade.paste((10, 3, 24, a), (0, y, W, y + 1))

    T = 'class="ar" style="text-align:center;font:800 {s}px/1.35 Tajawal;color:#fff;text-shadow:0 6px 30px rgba(0,0,0,.8)"'
    hook = shot("d3-hook", 1000, 340, f'<div {T.format(s=80)}>كيف نستخدم<br><span style="color:{YELLOW}">الذكاء الاصطناعي</span><br>في المحتوى؟ 🤖</div>')
    card = lambda n, t, sub, c: shot(f"d3-c{n}", 960, 300,
        f'<div class="ar" style="margin:20px;display:flex;align-items:center;gap:30px;background:rgba(20,5,42,.72);border:3px solid {c};'
        f'border-radius:40px;padding:30px 40px;color:#fff"><div style="font:800 120px Poppins;color:{c}">{n}</div>'
        f'<div><div style="font:800 64px/1.3 Tajawal">{t}</div><div style="font:600 38px/1.5 Tajawal;opacity:.9">{sub}</div></div></div>')
    cards = [card(1, "أفكار أكثر 💡", "عشرات الزوايا لنفس المنتج", "#14C8FF"),
             card(2, "صور إعلانية 🖼️", "بدون جلسة تصوير مكلفة", "#F2349E"),
             card(3, "مشاهد فيديو 🎬", "ريلز تخطف العين بسرعة", "#FF8A00")]
    final = shot("d3-final", 1000, 260, f'<div {T.format(s=64)}>والقرار النهائي…<br>دايم <span style="color:{YELLOW}">لفريقنا</span> 👌</div>')
    ai = shot("d3-ai", 300, 100, '<div style="font:600 28px Poppins;color:#fff;background:rgba(0,0,0,.45);padding:10px 24px;'
              'border-radius:999px;display:inline-block;margin:16px">AI image</div>')
    cta = shot("d3-cta", 1000, 200, f'<div style="text-align:center;padding-top:20px"><span class="ar" style="display:inline-block;background:{YELLOW};'
               f'color:#111;font:800 52px Tajawal;padding:24px 50px;border-radius:999px;box-shadow:0 14px 0 rgba(0,0,0,.25)">'
               f'تابعنا · واتساب {WA}</span></div>')

    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
           "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-t", str(DUR),
           "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-pix_fmt", "yuv420p",
           "-c:a", "aac", "-b:a", "128k", "-shortest", "-movflags", "+faststart", dest]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    starts = [3.2, 5.6, 8.0]
    for i in range(int(DUR * FPS)):
        t = i / FPS
        z = 1.0 + 0.08 * t / DUR
        cw, ch = int(W / z), int(H / z)
        ox, oy = (bg.width - cw) // 2, (bg.height - ch) // 2 - int(40 * t / DUR)
        fr = bg.crop((ox, oy, ox + cw, oy + ch)).resize((W, H), Image.BICUBIC).convert("RGBA")
        fr.alpha_composite(shade)
        place(fr, ai, W - 170, 80)
        place(fr, hook, W / 2, 1150, scale=0.9 + 0.1 * ease_out_back(t / 0.6), alpha=ease(t / 0.4) * (1 - ease((t - 2.8) / 0.4)))
        for k, (st, c) in enumerate(zip(starts, cards)):
            y = 1000 + k * 260
            place(fr, c, W / 2 + 300 * (1 - ease((t - st) / 0.5)), y, alpha=ease((t - st) / 0.35) * (1 - ease((t - 10.8) / 0.4)))
        place(fr, final, W / 2, 1300, alpha=ease((t - 11.2) / 0.5))
        place(fr, cta, W / 2, 1560, scale=ease_out_back((t - 12.0) / 0.6), alpha=ease((t - 12.0) / 0.3))
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
    files = sorted(f for f in os.listdir(POSTS) if f.startswith("D3") and f.endswith(".jpg"))
    thumbs = [Image.open(os.path.join(POSTS, f)).resize((300, 375)) for f in files]
    sheet = Image.new("RGB", (310 * 5 + 10, 385 * 2 + 10), (20, 20, 20))
    for i, t in enumerate(thumbs):
        sheet.paste(t, (10 + (i % 5) * 310, 10 + (i // 5) * 385))
    sheet.save(os.path.join(POSTS, "_preview-day3.png"))
    print(files)
