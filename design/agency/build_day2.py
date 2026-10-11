"""Day 2 (Mon 2026-10-12) posts in the v3 photo style + before/after AI Reel.

Photos: design/agency/photos/{cover2,social2,poll2,before,after}.jpg (Canva AI).
Outputs: out/posts-v3/D2-*.jpg and out/posts-v3/D2-P3-before-after-reel.mp4 (+ -cover.jpg).
Usage: python3 build_day2.py
"""
import os, subprocess
from PIL import Image
from build_photo_posts import render, bottom, PHOTOS, POSTS
from build_vivid import YELLOW, WA
from build_reel_launch import shot, ease, ease_out_back, place, TMP

MISTAKES = [
    ("purple", "تنشر بدون هدف", "كل منشور لازم يخدم هدف:<br>بيع، ثقة، أو تفاعل"),
    ("blue", "تصاميم زحمة", "خفف الكلام وخل الفكرة<br>وحدة وواضحة"),
    ("pink", "بدون <bdi>Hook</bdi>", "أول سطر هو اللي<br>يوقف التمرير"),
    ("orange", "تطنّش التعليقات", "الرد السريع يرفع الوصول<br>ويكسب ثقة عملائك"),
    ("launch", "ما تقول له وش يسوي", "حط دعوة واضحة:<br>راسلنا، احفظ، شارك"),
]


def posts():
    # 2.1 carousel cover + 5 slides + CTA
    render("D2-P1-01-cover", photo="cover2.jpg", inner=
           f'<div class="sticker" style="top:90px;right:60px;transform:rotate(5deg);font-family:Tajawal">اسحب ←</div>'
           + bottom('<div style="font:800 96px/1.2 Tajawal">ليش حسابك<br>ما يتفاعل؟ 🤔</div>'
                    f'<div style="font:800 58px/1.6 Tajawal;margin-top:18px"><span class="hl" style="padding:4px 18px 0;line-height:1.7">5 أخطاء</span> لازم توقفها</div>'))
    for i, (mesh, title, sub) in enumerate(MISTAKES, 1):
        render(f"D2-P1-0{i + 1}-mistake", mesh=mesh, seed=i, inner=
               '<div class="ar" style="position:absolute;inset:0;padding:150px 80px 0;text-align:center">'
               f'<div style="font:800 300px/1 Poppins;text-shadow:0 20px 60px rgba(0,0,0,.45)">{i}</div>'
               f'<div style="font:800 40px Tajawal;margin-top:20px;opacity:.85">الخطأ رقم {i} ❌</div>'
               f'<div style="font:800 96px/1.3 Tajawal;margin-top:30px">{title}</div>'
               f'<div style="margin-top:50px;display:inline-block;background:rgba(255,255,255,.14);border:2px solid rgba(255,255,255,.3);'
               f'border-radius:36px;padding:34px 50px;font:700 50px/1.55 Tajawal">✅ {sub}</div></div>')
    render("D2-P1-07-save", mesh="purple", seed=3, inner=
           '<div class="ar" style="position:absolute;inset:0;padding:230px 80px 0;text-align:center">'
           '<div style="font:800 200px/1 Tajawal">📌</div>'
           '<div style="font:800 100px/1.3 Tajawal;margin-top:40px">احفظ البوست</div>'
           '<div style="font:700 52px/1.6 Tajawal;margin-top:24px">وراجع حسابك عليه</div>'
           f'<div style="margin-top:60px;display:inline-block;background:{YELLOW};color:#111;font:800 48px Tajawal;padding:22px 50px;'
           'border-radius:999px;box-shadow:0 12px 0 rgba(0,0,0,.25)">نراجعه لك مجانًا 👌</div></div>')

    # 2.2 service — social media management
    render("D2-P2-social-service", photo="social2.jpg", inner=
           f'<div class="sticker" style="top:90px;right:60px;transform:rotate(5deg);font-family:Tajawal">إدارة السوشيال 📱</div>'
           + bottom('<div style="font:800 84px/1.2 Tajawal">حساباتك علينا…</div>'
                    f'<div style="font:800 62px/1.5 Tajawal;margin-top:8px">وأنت ركّز على <span style="color:{YELLOW}">شغلك</span> 💼</div>'
                    '<div style="margin-top:20px"><span class="chip">خطة شهرية</span><span class="chip">تصاميم</span><span class="chip">نشر منتظم</span>'
                    '<span class="chip">رد على العملاء</span><span class="chip">تقرير</span></div>', pad=140))

    # 2.4 poll
    render("D2-P4-poll", photo="poll2.jpg", inner=
           f'<div class="sticker" style="top:90px;right:60px;transform:rotate(5deg);font-family:Tajawal">سؤال الليلة 👇</div>'
           + bottom('<div style="font:800 78px/1.3 Tajawal">وش أكبر تحدي<br>يواجهك في التسويق؟</div>'
                    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:28px">'
                    + "".join(f'<div style="background:rgba(255,255,255,.16);border:2px solid rgba(255,255,255,.35);border-radius:24px;'
                              f'padding:16px 24px;font:700 42px Tajawal"><span style="font:800 42px Poppins;color:{YELLOW}">{k}</span>&nbsp; {v}</div>'
                              for k, v in [("A", "أفكار المحتوى"), ("B", "التصاميم"), ("C", "الإعلانات"), ("D", "الوقت")])
                    + '</div><div style="font:700 38px Tajawal;margin-top:22px;opacity:.9">اكتب الحرف بالتعليقات 💬</div>', pad=140))


def reel():
    """12s before→after wipe Reel, 1080x1920."""
    W, H, FPS, DUR = 1080, 1920, 30, 12.0
    dest = os.path.join(POSTS, "D2-P3-before-after-reel.mp4")
    os.makedirs(TMP, exist_ok=True)

    def fit(name):
        im = Image.open(os.path.join(PHOTOS, name)).convert("RGB")
        s = max(W / im.width, H / im.height) * 1.08
        return im.resize((int(im.width * s), int(im.height * s)), Image.LANCZOS)
    before, after = fit("before.jpg"), fit("after.jpg")

    def frame_of(im, z):
        cw, ch = int(W / z), int(H / z)
        ox, oy = (im.width - cw) // 2, (im.height - ch) // 2
        return im.crop((ox, oy, ox + cw, oy + ch)).resize((W, H), Image.BICUBIC)

    lbl = 'font:800 64px Tajawal;color:#fff;padding:16px 44px;border-radius:999px;display:inline-block;margin:20px'
    l_before = shot("d2-before", 400, 160, f'<div class="ar" style="{lbl};background:rgba(0,0,0,.6)">قبل 📱</div>')
    l_after = shot("d2-after", 400, 160, f'<div class="ar" style="{lbl};background:#F2349E">بعد ✨</div>')
    hook = shot("d2-hook", 1000, 300, '<div class="ar" style="text-align:center;font:800 84px/1.35 Tajawal;color:#fff;'
                'text-shadow:0 6px 30px rgba(0,0,0,.8)">صورة عادية بالجوال…<br>وش يصير لها؟ 👀</div>')
    title = shot("d2-title", 1000, 300, '<div class="ar" style="text-align:center;font:800 80px/1.35 Tajawal;color:#fff;'
                 f'text-shadow:0 6px 30px rgba(0,0,0,.8)">نفس المنتج…<br>بس بلمسة <span style="color:{YELLOW}">AI</span> 🤯</div>')
    ai = shot("d2-ai", 360, 110, '<div style="font:600 30px Poppins;color:#fff;background:rgba(0,0,0,.45);padding:12px 26px;'
              'border-radius:999px;display:inline-block;margin:16px"><span class="ar">عينة AI</span> · concept</div>')
    cta = shot("d2-cta", 1000, 340, f'<div style="text-align:center;padding-top:20px"><div class="ar" style="font:800 60px/1.4 Tajawal;color:#fff;'
               'text-shadow:0 6px 30px rgba(0,0,0,.8)">تبي نجرب على منتجك؟</div>'
               f'<span class="ar" style="display:inline-block;margin-top:24px;background:{YELLOW};color:#111;font:800 54px Tajawal;'
               f'padding:24px 54px;border-radius:999px;box-shadow:0 14px 0 rgba(0,0,0,.25)">واتساب {WA}</span></div>')

    shade = Image.new("RGBA", (W, H))
    for y in range(H):
        a = int(210 * max(0.0, (y - H * 0.55) / (H * 0.45)) ** 1.2)
        shade.paste((10, 3, 24, a), (0, y, W, y + 1))
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
           "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-t", str(DUR),
           "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-pix_fmt", "yuv420p",
           "-c:a", "aac", "-b:a", "128k", "-shortest", "-movflags", "+faststart", dest]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for i in range(int(DUR * FPS)):
        t = i / FPS
        z = 1.0 + 0.05 * t / DUR
        b, a = frame_of(before, z), frame_of(after, z)
        # wipe from right to left between 3.5s and 5.0s
        x = int(W * (1 - ease((t - 3.5) / 1.5)))
        fr = b.copy()
        if x < W:
            fr.paste(a.crop((x, 0, W, H)), (x, 0))
            if 0 < x < W:
                fr.paste((255, 210, 63), (max(0, x - 6), 0, x + 6, H))
        fr = fr.convert("RGBA")
        fr.alpha_composite(shade)
        place(fr, ai, W - 200, 90)
        place(fr, l_before, 220, 240, scale=ease_out_back((t - 0.3) / 0.5), alpha=1 - ease((t - 3.5) / 0.6))
        place(fr, hook, W / 2, 1450, alpha=ease((t - 0.6) / 0.5) * (1 - ease((t - 3.2) / 0.4)))
        place(fr, l_after, 220, 240, scale=ease_out_back((t - 5.0) / 0.5), alpha=ease((t - 5.0) / 0.3))
        place(fr, title, W / 2, 1400, alpha=ease((t - 5.6) / 0.5) * (1 - ease((t - 8.4) / 0.4)))
        place(fr, cta, W / 2, 1520, scale=ease_out_back((t - 8.8) / 0.6), alpha=ease((t - 8.8) / 0.3))
        out = fr.convert("RGB")
        fade = min(1.0, t / 0.3, (DUR - t) / 0.4)
        if fade < 1:
            out = Image.blend(Image.new("RGB", (W, H)), out, max(0.0, fade))
        p.stdin.write(out.tobytes())
    p.stdin.close()
    p.wait()
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", "6.5", "-i", dest, "-frames:v", "1", "-q:v", "2",
                    dest.replace(".mp4", "-cover.jpg")])
    print("ok", dest)


if __name__ == "__main__":
    os.makedirs(POSTS, exist_ok=True)
    posts()
    reel()
    files = sorted(f for f in os.listdir(POSTS) if f.startswith("D2") and f.endswith(".jpg"))
    thumbs = [Image.open(os.path.join(POSTS, f)).resize((300, 375)) for f in files]
    sheet = Image.new("RGB", (310 * 5 + 10, 385 * 2 + 10), (20, 20, 20))
    for i, t in enumerate(thumbs):
        sheet.paste(t, (10 + (i % 5) * 310, 10 + (i // 5) * 385))
    sheet.save(os.path.join(POSTS, "_preview-day2.png"))
    print(files)
