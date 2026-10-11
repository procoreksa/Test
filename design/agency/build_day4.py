"""Day 4 (Wed 2026-10-14) posts in the v3 photo style + AI restaurant sample Reel.

Photos: design/agency/photos/{besttime,creator4,perfume,steak,chef}.jpg (Canva AI).
Outputs: out/posts-v3/D4-*.jpg and out/posts-v3/D4-P3-ai-restaurant-reel.mp4 (+ -cover.jpg).
Usage: python3 build_day4.py
"""
import os, subprocess
from PIL import Image
from build_photo_posts import render, bottom, PHOTOS, POSTS
from build_vivid import YELLOW, WA
from build_reel_launch import shot, ease, ease_out_back, place, TMP

CONCEPT = ('<div style="position:absolute;top:40px;left:44px;font:700 24px Poppins;color:#111;background:{y};padding:10px 20px;'
           'border-radius:999px;z-index:5">Concept · <span class="ar">إعلان تجريبي</span></div>').format(y=YELLOW)
PERFUME = os.path.join(PHOTOS, "perfume.jpg")


def ad_card(letter, inner, color):
    return (f'<div style="position:relative;width:440px;height:640px;border-radius:28px;overflow:hidden;border:4px solid {color};'
            f'box-shadow:0 20px 60px rgba(0,0,0,.5);background:url({PERFUME}) center/cover">{inner}'
            f'<div style="position:absolute;top:-6px;left:-6px;width:110px;height:110px;border-radius:0 0 40px 0;background:{color};'
            f'font:800 72px/110px Poppins;color:#111;text-align:center">{letter}</div></div>')


def posts():
    # 4.1 best time to post
    render("D4-P1-best-time", photo="besttime.jpg", inner=
           f'<div class="sticker" style="top:90px;right:60px;transform:rotate(5deg);font-family:Tajawal">نصيحة اليوم ⏰</div>'
           + bottom('<div style="font:800 92px/1.2 Tajawal">متى أنشر؟ 🤔</div>'
                    f'<div style="font:800 60px/1.5 Tajawal;margin-top:6px">بياناتك <span style="color:{YELLOW}">تعرف الجواب</span></div>'
                    '<div style="margin-top:18px"><span class="chip">1 جرّب أوقات مختلفة</span><span class="chip">2 لمدة أسبوعين</span>'
                    '<span class="chip">3 افتح <bdi>Insights</bdi></span><span class="chip">4 ثبّت الأفضل</span></div>', pad=140))

    # 4.2 Reels & video service
    render("D4-P2-reels-service", photo="creator4.jpg", inner=
           f'<div class="sticker" style="top:90px;right:60px;transform:rotate(5deg);font-family:Tajawal">ريلز وفيديو 🎬</div>'
           + bottom('<div style="font:800 88px/1.2 Tajawal">ريلز توقف<br>التمرير ✋</div>'
                    f'<div style="font:700 48px/1.5 Tajawal;margin-top:10px">من الفكرة… <span style="color:{YELLOW}">لين النشر</span></div>'
                    '<div style="margin-top:18px"><span class="chip">فكرة</span><span class="chip">تصوير أو <bdi>AI</bdi></span>'
                    '<span class="chip">مونتاج</span><span class="chip">جاهز للنشر</span></div>', pad=140))

    # 4.4 A/B — same concept perfume ad, cluttered vs clean
    a = ad_card("A", '<div class="ar" style="position:absolute;inset:0;background:rgba(200,0,60,.35)"></div>'
                '<div class="ar" style="position:absolute;top:120px;left:0;right:0;text-align:center;font:800 54px/1.15 Tajawal;color:#FFEB3B;'
                'text-shadow:3px 3px 0 #d00">عرض!!! خصم!!!<br>لا يفوتك 🔥🔥</div>'
                '<div class="ar" style="position:absolute;bottom:150px;right:-10px;transform:rotate(-12deg);background:#ff1744;color:#fff;'
                'font:800 40px Tajawal;padding:14px 26px;border-radius:50%">50%</div>'
                '<div class="ar" style="position:absolute;bottom:30px;left:16px;right:16px;font:700 30px/1.3 Tajawal;color:#fff;'
                'background:#2962ff;padding:12px;text-align:center">اطلب الحين • توصيل مجاني • كمية محدودة • عطر فاخر</div>', "#FF5A5F")
    b = ad_card("B", '<div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0) 55%,rgba(0,0,0,.75))"></div>'
                '<div class="ar" style="position:absolute;bottom:60px;left:0;right:0;text-align:center;color:#fff">'
                '<div style="font:800 54px/1.3 Tajawal">عطر يترك أثر</div>'
                f'<div style="font:600 30px Tajawal;margin-top:8px;color:{YELLOW}">اكتشفه الحين ←</div></div>', "#14C8FF")
    render("D4-P4-a-or-b", mesh="purple", seed=2, inner=CONCEPT +
           '<div class="ar" style="position:absolute;top:110px;left:0;right:0;text-align:center">'
           f'<div style="font:800 96px/1.2 Tajawal"><bdi>A</bdi> ولا <bdi>B</bdi>؟ 👀</div>'
           '<div style="font:700 44px Tajawal;margin-top:6px;opacity:.9">نفس الإعلان… أي واحد يشدك أكثر؟</div></div>'
           f'<div style="position:absolute;top:340px;left:0;right:0;display:flex;justify-content:center;gap:40px">{a}{b}</div>'
           f'<div class="ar" style="position:absolute;bottom:150px;left:0;right:0;text-align:center"><span style="display:inline-block;'
           f'background:{YELLOW};color:#111;font:800 48px Tajawal;padding:20px 50px;border-radius:999px;box-shadow:0 12px 0 rgba(0,0,0,.25)">'
           'علّق بالحرف 👇</span></div>')


def reel():
    """15s AI restaurant sample Reel (steak → chef), 1080x1920."""
    W, H, FPS, DUR = 1080, 1920, 30, 15.0
    dest = os.path.join(POSTS, "D4-P3-ai-restaurant-reel.mp4")
    os.makedirs(TMP, exist_ok=True)

    def fit(name):
        im = Image.open(os.path.join(PHOTOS, name)).convert("RGB")
        s = max(W / im.width, H / im.height) * 1.15
        return im.resize((int(im.width * s), int(im.height * s)), Image.LANCZOS)
    shots = [fit("steak.jpg"), fit("chef.jpg")]

    def frame_of(im, z, dy):
        cw, ch = int(W / z), int(H / z)
        ox, oy = (im.width - cw) // 2, (im.height - ch) // 2 + dy
        oy = max(0, min(im.height - ch, oy))
        return im.crop((ox, oy, ox + cw, oy + ch)).resize((W, H), Image.BICUBIC)

    shade = Image.new("RGBA", (W, H))
    for y in range(H):
        a = int(220 * max(0.0, (y - H * 0.5) / (H * 0.5)) ** 1.2)
        shade.paste((8, 3, 10, a), (0, y, W, y + 1))
    T = 'class="ar" style="text-align:center;font:800 {s}px/1.35 Tajawal;color:#fff;text-shadow:0 6px 30px rgba(0,0,0,.85)"'
    badge = shot("d4-badge", 420, 110, '<div style="font:600 28px Poppins;color:#fff;background:rgba(0,0,0,.5);padding:10px 24px;'
                 'border-radius:999px;display:inline-block;margin:16px"><span class="ar">عينة AI · مو لعميل</span></div>')
    hook = shot("d4-hook", 1000, 260, f'<div {T.format(s=76)}>مطعمك يستاهل<br>إعلان كذا؟ 🔥</div>')
    mid = shot("d4-mid", 1000, 260, f'<div {T.format(s=72)}>مشهد كامل…<br>بـ<span style="color:{YELLOW}">الذكاء الاصطناعي</span> 🤯</div>')
    end = shot("d4-end", 1000, 200, f'<div {T.format(s=56)}>بتكلفة أقل من التصوير التقليدي</div>')
    cta = shot("d4-cta", 1000, 200, f'<div style="text-align:center;padding-top:20px"><span class="ar" style="display:inline-block;background:{YELLOW};'
               f'color:#111;font:800 52px Tajawal;padding:24px 50px;border-radius:999px;box-shadow:0 14px 0 rgba(0,0,0,.25)">'
               f'تبي مشهد لنشاطك؟ واتساب {WA}</span></div>')

    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
           "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-t", str(DUR),
           "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-pix_fmt", "yuv420p",
           "-c:a", "aac", "-b:a", "128k", "-shortest", "-movflags", "+faststart", dest]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for i in range(int(DUR * FPS)):
        t = i / FPS
        f1 = frame_of(shots[0], 1.0 + 0.10 * min(t, 7.5) / 7.5, -int(60 * min(t, 7.5) / 7.5))
        if t < 6.5:
            fr = f1
        else:
            f2 = frame_of(shots[1], 1.0 + 0.10 * (t - 6.5) / 8.5, int(80 * (t - 6.5) / 8.5))
            fr = Image.blend(f1, f2, ease((t - 6.5) / 1.0)) if t < 7.5 else f2
        fr = fr.convert("RGBA")
        fr.alpha_composite(shade)
        place(fr, badge, W - 230, 80)
        place(fr, hook, W / 2, 1450, alpha=ease((t - 0.5) / 0.5) * (1 - ease((t - 5.6) / 0.5)))
        place(fr, mid, W / 2, 1450, alpha=ease((t - 7.6) / 0.5) * (1 - ease((t - 10.6) / 0.4)))
        place(fr, end, W / 2, 1380, alpha=ease((t - 11.0) / 0.5))
        place(fr, cta, W / 2, 1560, scale=ease_out_back((t - 11.6) / 0.6), alpha=ease((t - 11.6) / 0.3))
        out = fr.convert("RGB")
        fade = min(1.0, t / 0.3, (DUR - t) / 0.4)
        if fade < 1:
            out = Image.blend(Image.new("RGB", (W, H)), out, max(0.0, fade))
        p.stdin.write(out.tobytes())
    p.stdin.close()
    p.wait()
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", "2.5", "-i", dest, "-frames:v", "1", "-q:v", "2",
                    dest.replace(".mp4", "-cover.jpg")])
    print("ok", dest)


if __name__ == "__main__":
    os.makedirs(POSTS, exist_ok=True)
    posts()
    reel()
    files = sorted(f for f in os.listdir(POSTS) if f.startswith("D4") and f.endswith(".jpg"))
    thumbs = [Image.open(os.path.join(POSTS, f)).resize((300, 375)) for f in files]
    sheet = Image.new("RGB", (310 * len(thumbs) + 10, 395), (20, 20, 20))
    for i, t in enumerate(thumbs):
        sheet.paste(t, (10 + i * 310, 10))
    sheet.save(os.path.join(POSTS, "_preview-day4.png"))
    print(files)
