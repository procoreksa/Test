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


def pager(i, n, top=70):
    return (f'<div style="position:absolute;top:{top}px;left:44px;font:700 26px Poppins;color:#c9cfe6">'
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



# ------------------------------------------------------------------ shared slide helpers
def numbered(name, i, n, title, desc, seed=0, emoji="", extra=""):
    render(name, seed=seed, inner=pager(i, n) +
           '<div class="ar" style="position:absolute;left:80px;right:80px;top:430px;text-align:center">'
           + (f'<div style="font:400 150px/1 Tajawal">{emoji}</div>' if emoji else
              f'<div class="num gt" style="font-size:200px;line-height:1">{i}</div>')
           + h(title, 84, 1.3, "margin-top:30px")
           + f'<div class="card" style="display:inline-block;margin-top:40px;padding:26px 40px;font:700 44px/1.6 Tajawal">{desc}</div>'
           + extra + '</div>')


def end_cta(text):
    return f'<div style="margin-top:44px"><span class="btn">{text}</span></div>'


def reel_endcard(lg, slogan_layer, cta_layer, t0, t, W=1080, H=1920):
    fr = Image.new("RGBA", (W, H), (5, 8, 23, 255))
    a = ease((t - t0) / 0.6)
    l = lg.copy()
    l.putalpha(l.getchannel("A").point(lambda v: int(v * a)))
    fr.alpha_composite(l, ((W - l.width) // 2, 480))
    place(fr, slogan_layer, W / 2, 1180, alpha=ease((t - t0 - 0.5) / 0.5))
    place(fr, cta_layer, W / 2, 1420, scale=ease_out_back((t - t0 - 1.0) / 0.6), alpha=ease((t - t0 - 1.0) / 0.3))
    return fr


def slogan_layer(name):
    T = 'class="ar" style="text-align:center;color:#fff"'
    return shot(name, 1000, 220, f'<div {T}><div style="font:800 58px/1.5 Tajawal">حيث يلتقي الإبداع بالابتكار</div>'
                f'<div style="font:600 24px Poppins;letter-spacing:6px;margin-top:6px">WHERE CREATIVITY MEETS INNOVATION</div></div>')


def bottom_shade(W=1080, H=1920, start=0.45, mx=200):
    sh = Image.new("RGBA", (W, H))
    for y in range(H):
        sh.paste((5, 8, 23, int(mx * max(0.0, (y - H * start) / (H * (1 - start))) ** 1.2)), (0, y, W, y + 1))
    return sh


# ------------------------------------------------------------------ Day 2
@post
def p05():
    render("P05-1", photo="p05_cover.jpg", photo_h=880, inner=block(
        h('قبل ما تنشر…<br>اسأل نفسك <span class="gt">5 أسئلة</span> ✋', 96, 1.3) + sub("اسحب وراجعها قبل كل منشور ←"), bottom=170))
    qs = [("مين بيشوف المنشور؟", "حدد جمهورك قبل ما تكتب أي كلمة"),
          ("وش الهدف منه؟", "بيع؟ ثقة؟ تفاعل؟ اختر واحد بس"),
          ("أول سطر يوقف التمرير؟", "عندك ثانيتين بس تشد انتباهه"),
          ("التصميم واضح من الجوال؟", "شوفه بحجم الشاشة الصغيرة قبل النشر"),
          ("وش الخطوة الجاية للعميل؟", "قول له بوضوح: راسلنا، احفظ، أو شارك")]
    for i, (q, d) in enumerate(qs, 1):
        numbered(f"P05-{i + 1}", i, 5, q, d, seed=i, extra=(end_cta("احفظ المنشور 📌") if i == 5 else ""))


@post
def p06():
    render("P06-1", photo="p06_team.jpg", photo_h=880, inner=block(
        h('كيف ندير <span class="gt">حساباتك</span>؟', 100, 1.25) + sub("5 مراحل واضحة… من الفهم لين التقرير ←"), bottom=170))
    st = [("🔍", "نفهم", "نشاطك، جمهورك، ومنافسينك"), ("🗓️", "نخطط", "خطة محتوى شهرية واضحة"),
          ("🎨", "ننتج", "تصاميم وفيديوهات بهوية وحدة"), ("💬", "ننشر ونتفاعل", "بالأوقات المناسبة ونرد على جمهورك"),
          ("📊", "نقيس ونحسّن", "تقرير شهري وتطوير مستمر")]
    for i, (e, t, d) in enumerate(st, 1):
        numbered(f"P06-{i + 1}", i, 5, f'<span class="gt">{i:02d}</span> {t}', d, seed=i + 1, emoji=e,
                 extra=(end_cta("راسلنا ونبدأ 👋") if i == 5 else ""))


@post
def p07():
    thumbs = "".join(f'<div style="width:260px;height:322px;border-radius:24px;overflow:hidden;border:3px solid rgba(255,255,255,.25);'
                     f'background:url(file://{os.path.join(PHOTOS, f)}) center/cover"></div>'
                     for f in ("prod_desert.jpg", "prod_marble.jpg", "prod_leaves.jpg"))
    render("P07-1", seed=2, inner=concept_badge() +
           '<div class="ar" style="position:absolute;left:70px;right:70px;top:330px;text-align:center">'
           + h('منتج واحد…<br><span class="gt">3 أجواء</span> 🤩', 104, 1.3)
           + sub("بالذكاء الاصطناعي، بدون جلسة تصوير كاملة")
           + f'<div style="display:flex;gap:26px;justify-content:center;margin-top:40px">{thumbs}</div>'
           + '<div style="font:700 32px Tajawal;margin-top:26px;color:#c9cfe6">اسحب وقول لنا أي جو يناسبك ←</div></div>', show_logo=True)
    for i, (f, t) in enumerate([("prod_desert.jpg", "الصحراء"), ("prod_marble.jpg", "الرخام"), ("prod_leaves.jpg", "الطبيعة")], 1):
        render(f"P07-{i + 1}", photo=f, photo_h=1060, inner=concept_badge() + block(
            f'<div style="display:flex;align-items:baseline;gap:22px"><span class="num gt" style="font-size:110px">{i}</span>'
            f'<span style="font:800 80px Tajawal">{t}</span></div>', bottom=150))


@post
def p08():
    opts = [("A", "إنستغرام"), ("B", "سناب شات"), ("C", "تيك توك"), ("D", "الكلام بين الناس")]
    grid = "".join(f'<div class="card" style="padding:18px 26px;font:800 40px Tajawal;display:flex;gap:18px;align-items:center">'
                   f'<span class="gt" style="font:700 46px Poppins">{k}</span>{v}</div>' for k, v in opts)
    render("P08-poll", photo="p08_phones.jpg", photo_h=820, inner=block(
        '<div style="font:700 32px Tajawal;color:#7FD6FF">سؤال سريع 👇</div>'
        + h('من وين يجيك<br><span class="gt">أغلب عملائك</span>؟', 92, 1.3)
        + f'<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:26px">{grid}</div>'
        + '<div style="font:700 34px Tajawal;margin-top:20px;color:#c9cfe6">اكتب الحرف بالتعليقات 💬</div>', bottom=150))


# ------------------------------------------------------------------ Day 3
@post
def p09():
    render("P09-1", photo="p09_identity.jpg", photo_h=880, inner=block(
        h('الهوية البصرية…<br><span class="gt">مو بس شعار</span> 🎨', 100, 1.3) + sub("اسحب وشوف العناصر اللي تصنعها ←"), bottom=170))
    sw = "".join(f'<span style="display:inline-block;width:110px;height:110px;border-radius:24px;background:{c};margin:0 8px"></span>'
                 for c in ("#2F6BFF", "#14C8FF", "#8B1FE8", "#F2349E", "#FF8A00", "#FFD23F"))
    spec = ('<div class="card" style="display:inline-block;margin-top:30px;padding:20px 40px">'
            '<div style="font:800 70px Tajawal">أ ب ت ث ج</div><div style="font:700 56px Poppins;direction:ltr">Aa Bb Cc</div></div>')
    items = [("✳️", "الشعار", "توقيعك اللي يتذكره الناس من أول نظرة", ""),
             ("🎨", "الألوان", "تصنع إحساس… قبل ما يقرأ أحد كلمة", f'<div style="margin-top:34px">{sw}</div>'),
             ("🔤", "الخطوط", "صوت علامتك المكتوب", spec),
             ("📸", "أسلوب الصور والتطبيقات", "كل منشور ومطبوعة يتكلمون نفس اللغة", end_cta("احفظ المنشور 📌"))]
    for i, (e, t, d, x) in enumerate(items, 1):
        numbered(f"P09-{i + 1}", i, 4, t, d, seed=i, emoji=e, extra=x)


@post
def p10():
    W, H, FPS, DUR = 1080, 1920, 30, 15.0
    shots = [fit(os.path.join(PHOTOS, f)) for f in ("c_oud.jpg", "c_juice.jpg", "c_watch.jpg", "c_horse.jpg")]
    T = 'class="ar" style="text-align:center;color:#fff;text-shadow:0 6px 30px rgba(0,0,0,.85)"'
    badge = shot("p10-badge", 640, 110, f'<div style="text-align:center;padding-top:16px"><span class="ar" style="font:700 30px Tajawal;color:#111;background:{YELLOW};padding:8px 22px;border-radius:999px">نموذج تصوري · مشاهد بالذكاء الاصطناعي</span></div>')
    hook = shot("p10-hook", 1000, 300, f'<div {T}><div style="font:800 88px/1.3 Tajawal">مشاهد سينمائية…<br>بالذكاء الاصطناعي ✨</div></div>')
    labels = [shot(f"p10-l{i}", 800, 130, f'<div {T}><div style="font:800 60px Tajawal">{t}</div></div>')
              for i, t in enumerate(["عطور وبخور", "مشروبات", "ساعات وإكسسوار", "روح المكان"])]
    cta = shot("p10-cta", 1000, 170, '<div style="text-align:center;padding-top:20px"><span class="btn ar">وش المشهد اللي تبيه لعلامتك؟</span></div>')
    slog = slogan_layer("p10-slogan")
    lg = logo_layer(620)
    shade = bottom_shade()
    seg = 2.9

    def frames():
        for i in range(int(DUR * FPS)):
            t = i / FPS
            if t < 11.6:
                k = min(3, int(t // seg))
                lt = t - k * seg
                fr = kb(shots[k], 1.0 + 0.10 * lt / seg, dy=-int(50 * lt / seg))
                if k > 0 and lt < 0.4:
                    fr = Image.blend(kb(shots[k - 1], 1.10, dy=-50), fr, ease(lt / 0.4))
                fr = fr.convert("RGBA")
                fr.alpha_composite(shade)
                place(fr, badge, W / 2, 110)
                if t < 2.6:
                    place(fr, hook, W / 2, 1420, alpha=ease(t / 0.4) * (1 - ease((t - 2.2) / 0.4)))
                else:
                    place(fr, labels[k], W / 2, 1560, alpha=ease((lt - 0.3) / 0.3) * (1 - ease((lt - seg + 0.3) / 0.3)))
            else:
                fr = reel_endcard(lg, slog, cta, 11.6, t)
            out = fr.convert("RGB")
            fade = min(1.0, t / 0.3, (DUR - t) / 0.4)
            if fade < 1:
                out = Image.blend(Image.new("RGB", (W, H)), out, max(0.0, fade))
            yield out
    dest = os.path.join(OUT, "P10-reel.mp4")
    encode(frames(), dest, FPS, DUR)
    cover_from(dest, 1.2, os.path.join(OUT, "P10-reel-cover.jpg"))
    print("reel", dest)


@post
def p11():
    render("P11-1", photo="p11_hands.jpg", photo_h=880, inner=block(
        h('<span class="gt">4 خرافات</span> عن الذكاء<br>الاصطناعي في التسويق 🤖', 90, 1.35) + sub("اسحب وشوف الحقيقة ←"), bottom=170))
    myths = [("AI يغني عن المصمم", "يسرّع الشغل… والذوق والقرار للمصمم"),
             ("صور AI شكلها دايم رخيص", "الجودة تعتمد على الفكرة والإخراج والتعديل"),
             ("أي أحد يكتب أمر يطلع إعلان", "الإعلان يحتاج رسالة واستراتيجية وفهم للجمهور"),
             ("AI يضمن لك مبيعات", "ما في أداة تضمن مبيعات… التجربة والقياس هي اللي تفرق")]
    for i, (m, f) in enumerate(myths, 1):
        render(f"P11-{i + 1}", seed=i, inner=pager(i, 4) +
               '<div class="ar" style="position:absolute;left:80px;right:80px;top:400px;text-align:right">'
               f'<div style="font:800 40px Tajawal;color:#FF6B8B">❌ خرافة</div>'
               + h(m, 78, 1.35, "margin-top:10px;color:#ffd6de")
               + '<div class="bar" style="margin:44px 0"></div>'
               f'<div style="font:800 40px Tajawal;color:#5CF2B0">✅ الحقيقة</div>'
               + h(f, 64, 1.45, "margin-top:10px")
               + (end_cta("احفظ المنشور 📌") if i == 4 else "") + '</div>')


@post
def p12():
    render("P12-1", photo="p12_mandi.jpg", photo_h=880, inner=concept_badge() + block(
        '<div style="font:700 34px Tajawal;color:#7FD6FF">نموذج تصوري</div>'
        + h('لو عندنا <span class="gt">مطعم مندي</span>…<br>وش بنسوي له؟ 🍖', 90, 1.35), bottom=170))
    render("P12-2", photo="p12_interior.jpg", photo_h=880, inner=concept_badge() + pager(1, 3, 110) + block(
        '<div style="font:800 40px Tajawal;color:#7FD6FF">الفكرة 💡</div>'
        + h('طعم البيت…<br>بجلسة <span class="gt">تراثية</span>', 92, 1.3)
        + sub("رسالة وحدة واضحة: أكل أصيل وجلسة مريحة للعائلة"), bottom=170))
    phone = (f'<div style="width:470px;height:840px;border-radius:56px;border:10px solid #1b1f33;overflow:hidden;position:relative;'
             f'background:url(file://{os.path.join(PHOTOS, "p12_mandi.jpg")}) center/cover;box-shadow:0 30px 80px rgba(0,0,0,.6)">'
             '<div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0) 45%,rgba(0,0,0,.85))"></div>'
             '<div class="ar" style="position:absolute;bottom:50px;left:0;right:0;text-align:center">'
             '<div style="font:800 54px/1.3 Tajawal">مندي على أصوله 🔥</div>'
             f'<div style="display:inline-block;margin-top:16px;background:{YELLOW};color:#111;font:800 32px Tajawal;padding:12px 30px;border-radius:999px">اطلب الحين</div></div></div>')
    render("P12-3", seed=1, inner=concept_badge() + pager(2, 3, 110) +
           '<div class="ar" style="position:absolute;left:70px;right:70px;top:240px;display:flex;gap:40px;align-items:center">'
           f'<div style="flex:1">{h("شكل الإعلان 📱", 76, 1.3)}{sub("صورة شهية، رسالة قصيرة، وزر واضح")}</div>{phone}</div>')
    plan = [("ريل تحضير المندي", "🎬"), ("صور الجلسات والأجواء", "📸"), ("منشور: أطباق الافتتاح", "🍽️"), ("سؤال: وش تحب مع المندي؟", "💬")]
    rows = "".join(f'<div class="card" style="padding:22px 30px;margin-top:16px;font:700 44px Tajawal;display:flex;gap:20px;align-items:center">'
                   f'<span style="font-size:48px">{e}</span>{t}</div>' for t, e in plan)
    render("P12-4", seed=2, inner=concept_badge() + pager(3, 3, 110) +
           '<div class="ar" style="position:absolute;left:80px;right:80px;top:320px">'
           + h('خطة <span class="gt">أول أسبوع</span> 🗓️', 84, 1.3) + rows
           + '<div style="text-align:center">' + end_cta("تبي تصور لمطعمك؟ راسلنا") + '</div></div>')


# ------------------------------------------------------------------ generic photo Reel
def photo_reel(name, files, hook_html, labels, cta_text, badge_text=None, seg=None, dur=15.0, cover_t=1.2):
    W, H, FPS = 1080, 1920, 30
    shots = [fit(os.path.join(PHOTOS, f)) for f in files]
    n = len(shots)
    body_end = dur - 3.4
    seg = seg or body_end / n
    T = 'class="ar" style="text-align:center;color:#fff;text-shadow:0 6px 30px rgba(0,0,0,.85)"'
    hook = shot(f"{name}-hook", 1000, 320, f'<div {T}><div style="font:800 86px/1.3 Tajawal">{hook_html}</div></div>')
    labs = [shot(f"{name}-l{i}", 1000, 160, f'<div {T}><div style="font:800 60px/1.3 Tajawal">{t}</div></div>') for i, t in enumerate(labels)]
    badge = (shot(f"{name}-badge", 760, 110, f'<div style="text-align:center;padding-top:16px"><span class="ar" style="font:700 30px Tajawal;'
                  f'color:#111;background:{YELLOW};padding:8px 22px;border-radius:999px">{badge_text}</span></div>') if badge_text else None)
    cta = shot(f"{name}-cta", 1000, 170, f'<div style="text-align:center;padding-top:20px"><span class="btn ar">{cta_text}</span></div>')
    slog = slogan_layer(f"{name}-slogan")
    lg = logo_layer(620)
    shade = bottom_shade()

    def frames():
        for i in range(int(dur * FPS)):
            t = i / FPS
            if t < body_end:
                k = min(n - 1, int(t // seg))
                lt = t - k * seg
                fr = kb(shots[k], 1.0 + 0.09 * lt / seg, dy=-int(40 * lt / seg))
                if k > 0 and lt < 0.4:
                    fr = Image.blend(kb(shots[k - 1], 1.09, dy=-40), fr, ease(lt / 0.4))
                fr = fr.convert("RGBA")
                fr.alpha_composite(shade)
                if badge:
                    place(fr, badge, W / 2, 110)
                if t < 2.4:
                    place(fr, hook, W / 2, 1420, alpha=ease(t / 0.4) * (1 - ease((t - 2.0) / 0.4)))
                elif k < len(labs):
                    place(fr, labs[k], W / 2, 1540, alpha=ease((lt - 0.2) / 0.3) * (1 - ease((lt - seg + 0.3) / 0.3)))
            else:
                fr = reel_endcard(lg, slog, cta, body_end, t)
            out = fr.convert("RGB")
            fade = min(1.0, t / 0.3, (dur - t) / 0.4)
            if fade < 1:
                out = Image.blend(Image.new("RGB", (W, H)), out, max(0.0, fade))
            yield out
    dest = os.path.join(OUT, f"{name}-reel.mp4")
    encode(frames(), dest, FPS, dur)
    cover_from(dest, cover_t, os.path.join(OUT, f"{name}-reel-cover.jpg"))
    print("reel", dest)


def list_slide(name, i, n, title, rows, seed=0, extra=""):
    r = "".join(f'<div class="card" style="padding:22px 30px;margin-top:16px;font:700 42px/1.45 Tajawal;display:flex;gap:20px;align-items:center">'
                f'<span style="font-size:46px">{e}</span>{t}</div>' for e, t in rows)
    render(name, seed=seed, inner=(pager(i, n) if n else "") +
           '<div class="ar" style="position:absolute;left:80px;right:80px;top:330px">' + h(title, 80, 1.3) + r + extra + '</div>')


def statement(name, title, subtitle, seed=0, extra="", top=380):
    render(name, seed=seed, inner='<div class="ar" style="position:absolute;left:80px;right:80px;top:%dpx;text-align:center">' % top
           + h(title, 100, 1.3) + (sub(subtitle, 44) if subtitle else "") + extra + '</div>')


# ------------------------------------------------------------------ Day 4
@post
def p13():
    render("P13-1", photo="p13_creator.jpg", photo_h=860, inner=block(
        h('أول <span class="gt">3 ثواني</span><br>تقرر كل شي ⏱️', 100, 1.3) + sub("5 بدايات تخلي الناس يكملون فيديوك ←"), bottom=170))
    hooks = [("لا تسوي هالغلطة لو…", "ابدأ بتحذير يمس جمهورك مباشرة"),
             ("3 أشياء ما أحد قالك عنها", "رقم + فضول = مشاهدة أطول"),
             ("لو عندك مشروع… هذا لك", "نادِ جمهورك باسمه من أول ثانية"),
             ("قبل وبعد", "خل الفرق يتكلم قبل الكلام"),
             ("سؤال مباشر", "«تبي تعرف ليش منشوراتك ما توصل؟»")]
    for i, (q, d) in enumerate(hooks, 1):
        numbered(f"P13-{i + 1}", i, 5, f"«{q}»", d, seed=i, extra=(end_cta("احفظها وجرّبها 📌") if i == 5 else ""))


@post
def p14():
    render("P14-1", photo="p14_funnel.jpg", photo_h=900, inner=block(
        h('ليش بعض الحملات<br><span class="gt">ما تجيب نتيجة</span>؟ 🎯', 92, 1.3) + sub("لأنها تكلم الكل بنفس الرسالة… اسحب ←"), bottom=170))
    st = [("👀", "يعرفك", "محتوى يلفت ويعرّف بعلامتك"), ("🤔", "يهتم", "فيديوهات ونماذج توضح القيمة"),
          ("✅", "يقرر", "إعلان واضح بعرض وسبب للثقة"), ("💬", "يتواصل", "رد سريع ومتابعة لين يصير عميل")]
    for i, (e, t, d) in enumerate(st, 1):
        numbered(f"P14-{i + 1}", i, 4, f'<span class="gt">{i:02d}</span> {t}', d, seed=i, emoji=e,
                 extra=(end_cta("احفظ المنشور 📌") if i == 4 else ""))


@post
def p15():
    render("P15-1", photo="villa_night.jpg", photo_h=900, inner=concept_badge() + block(
        '<div style="font:700 34px Tajawal;color:#7FD6FF">نموذج تصوري · عقار</div>'
        + h('بيتك الجاي…<br><span class="gt">يستاهل يتشاف</span> 🏡', 96, 1.3), bottom=170))
    render("P15-2", photo="villa_pool.jpg", photo_h=900, inner=concept_badge() + pager(1, 2, 110) + block(
        '<div style="font:800 40px Tajawal;color:#7FD6FF">الفكرة 💡</div>'
        + h('صورة ليلية فخمة<br>+ <span class="gt">رسالة وحدة</span>', 88, 1.3)
        + sub("نبيع الإحساس بالمكان… مو بس المساحة"), bottom=170))
    list_slide("P15-3", 2, 2, 'عناصر <span class="gt">الإعلان</span> 🧩',
               [("📸", "صور ليلية تبرز الإضاءة والتفاصيل"), ("🎬", "ريل جولة قصيرة داخل الفيلا"),
                ("🗺️", "الموقع والمزايا بنقاط بسيطة"), ("📅", "دعوة واضحة: احجز زيارتك")], seed=2,
               extra='<div style="text-align:center">' + end_cta("تبي إعلان لمشروعك؟ راسلنا") + '</div>')
    # put concept badge on the list slide too
    render("P15-3", seed=2, inner=concept_badge() + pager(2, 2, 110) +
           '<div class="ar" style="position:absolute;left:80px;right:80px;top:330px">' + h('عناصر <span class="gt">الإعلان</span> 🧩', 80, 1.3)
           + "".join(f'<div class="card" style="padding:22px 30px;margin-top:16px;font:700 42px/1.45 Tajawal;display:flex;gap:20px;align-items:center">'
                     f'<span style="font-size:46px">{e}</span>{t}</div>' for e, t in
                     [("📸", "صور ليلية تبرز الإضاءة والتفاصيل"), ("🎬", "ريل جولة قصيرة داخل الفيلا"),
                      ("🗺️", "الموقع والمزايا بنقاط بسيطة"), ("📅", "دعوة واضحة: احجز زيارتك")])
           + '<div style="text-align:center">' + end_cta("تبي إعلان لمشروعك؟ راسلنا") + '</div></div>')


@post
def p16():
    statement("P16-engage", 'كمّل الجملة 👇', None, seed=1, top=330, extra=
              '<div class="card" style="margin-top:50px;padding:50px 40px;font:800 70px/1.5 Tajawal">'
              '«أكبر غلطة في<br>الإعلانات هي <span class="gt">……</span>»</div>'
              '<div style="font:700 40px Tajawal;margin-top:40px;color:#c9cfe6">نبي نسمع رأيك بالتعليقات 💬</div>')


# ------------------------------------------------------------------ Day 5
@post
def p17():
    statement("P17-1", 'وش يخلي<br>الإعلان <span class="gt">يشتغل</span>؟ 🎯', "5 عناصر… شيّك كم واحد عندك ←", seed=0, top=420)
    el = [("صورة توقف التمرير", "أول شي يشوفه العميل… خله يستاهل"), ("رسالة وحدة واضحة", "فكرة وحدة أقوى من عشر أفكار"),
          ("فايدة مفهومة", "وش بيستفيد العميل؟ قلها بوضوح"), ("سبب يخليك تثق", "تجربة، ضمان، أو تفاصيل حقيقية"),
          ("دعوة واضحة", "راسلنا، اطلب، احجز… خطوة وحدة")]
    for i, (t, d) in enumerate(el, 1):
        numbered(f"P17-{i + 1}", i, 5, t, d, seed=i, extra=(end_cta("كم عنصر عندك؟ علّق 👇") if i == 5 else ""))


@post
def p18():
    steps = [("01", "نسمع", "هدفك وجمهورك"), ("02", "نبتكر", "فكرة ومحتوى يناسبك"), ("03", "ننفذ ونقيس", "ننشر ونتابع ونحسّن")]
    cards = "".join(f'<div class="card" style="flex:1;padding:36px 20px;text-align:center"><div class="num gt" style="font-size:80px">{n}</div>'
                    f'<div style="font:800 52px/1.3 Tajawal;margin-top:10px">{t}</div><div style="font:700 32px/1.5 Tajawal;color:#c9cfe6;margin-top:8px">{d}</div></div>'
                    for n, t, d in steps)
    statement("P18-steps", 'شغلنا ببساطة<br>في <span class="gt">3 خطوات</span> 👇', None, seed=2, top=330,
              extra=f'<div style="display:flex;gap:22px;margin-top:50px">{cards}</div>' + end_cta("جاهز نبدأ؟ راسلنا"))


@post
def p19():
    photo_reel("P19", ["b_shoot.jpg", "b_edit.jpg", "b_review.jpg"], 'يوم في الاستوديو 🎥☕',
               ["تصوير وتجهيز 📸", "مونتاج وتلوين 🎞️", "مراجعة لين يطلع مضبوط ✅"], "تابعنا عشان تشوف أكثر 👀",
               badge_text="مشاهد توضيحية بالذكاء الاصطناعي", cover_t=1.0)


@post
def p20():
    statement("P20-1", 'محتوى ولا <span class="gt">إعلانات</span>؟ 🤔', "سؤال يحيّر أصحاب المشاريع… اسحب ←", seed=1, top=470)
    numbered("P20-2", 1, 2, "المحتوى", "يبني الثقة ويعرّف الناس عليك… على المدى الطويل", seed=2, emoji="📱")
    numbered("P20-3", 2, 2, "الإعلان", "يوصلك لناس جدد بسرعة… ويسرّع النتائج", seed=3, emoji="📣",
             extra='<div style="font:800 46px Tajawal;margin-top:40px">الجواب؟ <span class="gt">الاثنين</span> مع بعض ✅</div>' + end_cta("اسألنا بالتعليقات 👇"))


# ------------------------------------------------------------------ Day 6
@post
def p21():
    statement("P21-1", 'راجع حسابك<br>في <span class="gt">دقيقتين</span> ✅', "5 نقاط… كم علامة صح بتطلع معك؟ ←", seed=0, top=420)
    items = [("البايو يوضح وش تقدم؟", "جملة وحدة واضحة + طريقة تواصل"), ("صورة البروفايل واضحة؟", "شعار مقروء حتى بحجم صغير"),
             ("الهايلايت مرتبة؟", "خدمات، أعمال، أسئلة، تواصل"), ("آخر 9 منشورات متناسقة؟", "نفس الألوان والأسلوب"),
             ("طريقة التواصل واضحة؟", "زر تواصل أو رابط واتساب")]
    for i, (t, d) in enumerate(items, 1):
        numbered(f"P21-{i + 1}", i, 5, f"☑️ {t}", d, seed=i, extra=(end_cta("كم علامة صح؟ علّق 👇") if i == 5 else ""))


@post
def p22():
    render("P22-1", photo="oud_chips.jpg", photo_h=920, inner=concept_badge() + block(
        '<div style="font:700 34px Tajawal;color:#FFD23F">نموذج تصوري · إطلاق عطر</div>'
        + h('عود… <span class="gt">بحضور مختلف</span> 🖤', 96, 1.3), bottom=170))
    render("P22-2", photo="oud_hand.jpg", photo_h=920, inner=concept_badge() + pager(1, 3, 110) + block(
        '<div style="font:800 40px Tajawal;color:#FFD23F">الإحساس ✨</div>'
        + h('فخامة تلمس<br><span class="gt">الذوق السعودي</span>', 90, 1.3), bottom=170))
    render("P22-3", photo="c_oud.jpg", photo_h=920, inner=concept_badge() + pager(2, 3, 110) + block(
        '<div style="font:800 40px Tajawal;color:#FFD23F">الصور الإعلانية 📸</div>'
        + h('بالذكاء الاصطناعي…<br><span class="gt">بدون جلسة تصوير</span>', 86, 1.3), bottom=170))
    render("P22-4", seed=2, inner=concept_badge() + pager(3, 3, 110) +
           '<div class="ar" style="position:absolute;left:80px;right:80px;top:330px">' + h('خطة <span class="gt">الإطلاق</span> 🗓️', 80, 1.3)
           + "".join(f'<div class="card" style="padding:22px 30px;margin-top:16px;font:700 42px/1.45 Tajawal;display:flex;gap:20px;align-items:center">'
                     f'<span style="font-size:46px">{e}</span>{t}</div>' for e, t in
                     [("🔒", "تشويق: «قريبًا…» بصورة غامضة"), ("🎬", "ريل كشف العطر"), ("🖤", "منشور: قصة الرائحة"), ("🎁", "دعوة للتجربة في المتجر")])
           + '<div style="text-align:center">' + end_cta("وش رأيك بالأسلوب؟ علّق 👇") + '</div></div>')


@post
def p23():
    photo_reel("P23", ["s_riyadh.jpg", "s_shop.jpg", "s_phone.jpg"], 'ليش بدأنا<br><span style="color:#FFD23F">ProCore Media</span>؟ 💡',
               ["كل يوم تبدأ مشاريع جديدة 🌅", "وكل مشروع يستاهل حضور يشبهه ✨", "ويوصل لجمهوره صح 📱"], "تابع رحلتنا 🚀", cover_t=1.0)


@post
def p24():
    opts = [("A", "مطعم برجر 🍔"), ("B", "كافيه ☕"), ("C", "صالون 💇‍♀️"), ("D", "متجر عبايات 🖤")]
    grid = "".join(f'<div class="card" style="padding:26px 26px;font:800 44px Tajawal;display:flex;gap:18px;align-items:center">'
                   f'<span class="gt" style="font:700 52px Poppins">{k}</span>{v}</div>' for k, v in opts)
    statement("P24-poll", 'أنتم <span class="gt">تختارون</span> 👇', "وش النموذج التصوري الجاي؟", seed=1, top=330,
              extra=f'<div style="display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:44px;text-align:right">{grid}</div>'
                    '<div style="font:700 38px Tajawal;margin-top:34px;color:#c9cfe6">الأكثر تصويتًا نشتغل عليه 🔥</div>')


# ------------------------------------------------------------------ Day 7
@post
def p25():
    statement("P25-1", 'خلص <span class="gt">أسبوعنا الأول</span> 🙌', "أبرز النماذج التصورية اللي اشتغلنا عليها ←", seed=0, top=440)
    picks = [("prod_desert.jpg", "منتج واحد بثلاث أجواء"), ("p12_mandi.jpg", "مطعم مندي"), ("villa_night.jpg", "مشروع سكني"), ("oud_chips.jpg", "إطلاق عطر عود")]
    for i, (f, t) in enumerate(picks, 1):
        render(f"P25-{i + 1}", photo=f, photo_h=1000, inner=concept_badge() + pager(i, 4, 110) + block(
            f'<div style="display:flex;align-items:baseline;gap:22px"><span class="num gt" style="font-size:96px">{i:02d}</span>'
            f'<span style="font:800 72px Tajawal">{t}</span></div>', bottom=150))


@post
def p26():
    rs = [("01", "أفكار تفهم السوق والذوق السعودي"), ("02", "إنتاج أسرع بأدوات الذكاء الاصطناعي"), ("03", "تنفيذ متكامل من الفكرة لين التقرير")]
    rows = "".join(f'<div class="card" style="padding:26px 34px;margin-top:18px;display:flex;gap:26px;align-items:center">'
                   f'<span class="num gt" style="font-size:64px">{n}</span><span style="font:800 46px/1.4 Tajawal">{t}</span></div>' for n, t in rs)
    statement("P26-reasons", '3 أسباب تشتغل<br>مع <span class="gt">ProCore Media</span>', None, seed=2, top=270,
              extra=f'<div style="margin-top:36px;text-align:right">{rows}</div>'
                    '<div style="font:700 32px/1.5 Tajawal;margin-top:24px;color:#c9cfe6">شغل مدروس ومتابعة حقيقية 🤝</div>')


@post
def p27():
    photo_reel("P27", ["c_oud.jpg", "c_juice.jpg", "c_watch.jpg", "c_horse.jpg", "prod_marble.jpg"],
               'أسبوع من الإبداع…<br>في <span style="color:#FFD23F">15 ثانية</span> 🎬',
               ["عطور وبخور", "مشروبات", "ساعات", "روح المكان", "منتجات العناية"], "تبي نسوي لعلامتك؟ راسلنا",
               badge_text="نماذج تصورية · ليست مشاريع لعملاء", cover_t=1.0)


@post
def p28():
    render("P28-cta", seed=1, show_logo=False, inner=
           f'<img src="file://{os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets", "logo_lockup.png")}" '
           'style="position:absolute;top:150px;left:50%;transform:translateX(-50%);width:440px;mix-blend-mode:screen">'
           '<div class="ar" style="position:absolute;left:80px;right:80px;top:600px;text-align:center">'
           + h('جاهز <span class="gt">تبدأ</span>؟ 🚀', 116, 1.3)
           + sub("احكِ لنا عن مشروعك وهدفك… وخلّنا نقترح عليك فكرة تناسبك", 42)
           + f'<div style="margin-top:44px;display:flex;align-items:center;gap:26px;justify-content:center">'
             f'<span class="btn">راسلنا الآن</span><span style="font:700 42px Poppins;direction:ltr">{WA}</span></div></div>')

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
