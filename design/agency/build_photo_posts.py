"""v3 social posts: full-bleed AI photos (Saudi people/settings) + Saudi-dialect copy.

Photos were generated in Canva (AI) and exported to design/agency/photos/.
Renders to design/agency/out/posts-v3/. Usage: python3 build_photo_posts.py
"""
import os, subprocess
from PIL import Image
from build_assets import CHROME, SRC, OUT
from build_vivid import BASE, MESHES, foot, deco, big_icon, YELLOW

HERE = os.path.dirname(os.path.abspath(__file__))
PHOTOS = os.path.join(HERE, "photos")
POSTS = os.path.join(OUT, "posts-v3")
W, H = 1080, 1350

CSS = BASE + """
.photo { position:absolute; inset:0; background-size:cover; background-position:center top; }
.shade { position:absolute; inset:0; background:
  linear-gradient(180deg, rgba(20,5,42,0) 30%, rgba(20,5,42,.55) 55%, rgba(12,3,26,.96) 82%),
  linear-gradient(135deg, rgba(47,107,255,.18), rgba(242,52,158,.18)); }
.ai { position:absolute; top:40px; left:44px; font:600 22px Poppins; color:#fff; opacity:.8;
  background:rgba(0,0,0,.35); padding:8px 16px; border-radius:999px; }
.chip { display:inline-block; padding:12px 28px; margin:8px 6px; border-radius:999px; font:700 34px Tajawal;
  background:rgba(255,255,255,.16); border:2px solid rgba(255,255,255,.35); }
"""


def render(name, inner, photo=None, mesh=None, seed=0):
    bg = (f'<div class="photo" style="background-image:url({os.path.join(PHOTOS, photo)})"></div><div class="shade"></div>'
          f'<div class="ai">AI image</div>' if photo else deco(seed))
    style = f"background:{MESHES[mesh]}" if mesh else "background:#000"
    html = (f'<!doctype html><html><head><meta charset="utf-8"><style>{CSS}</style></head><body>'
            f'<div class="p" style="{style}">{bg}<div class="noise"></div>{inner}{foot()}</div></body></html>')
    src = os.path.join(SRC, f"photo-{name}.html")
    open(src, "w").write(html)
    out = os.path.join(POSTS, f"{name}.png")
    subprocess.run([CHROME, "--headless", "--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--allow-file-access-from-files",
                    "--virtual-time-budget=3000", f"--window-size={W},{H + 200}", f"--screenshot={out}", "file://" + src],
                   capture_output=True)
    Image.open(out).convert("RGB").crop((0, 0, W, H)).save(out.replace(".png", ".jpg"), quality=92)
    os.remove(out)
    print("rendered", name)


def bottom(html, pad=150):
    return f'<div class="ar" style="position:absolute;left:70px;right:70px;bottom:{pad}px;text-align:right">{html}</div>'


def main():
    os.makedirs(POSTS, exist_ok=True)

    # D1-P1 — launch (photo)
    render("D1-P1-launch", photo="launch.jpg", inner=
           f'<div class="sticker" style="top:90px;right:60px;transform:rotate(6deg);font-family:Tajawal">انطلقنا 🚀</div>'
           + bottom('<div style="font:800 92px/1.15 Tajawal">حيّاكم في</div>'
                    '<div style="font:800 84px/1.4 Poppins;margin-top:6px;direction:ltr;text-align:right"><span class="hl">ProCore Media</span></div>'
                    f'<div style="font:700 46px/1.5 Tajawal;margin-top:22px">نسوي لك محتوى وإعلانات<br>تخلّي مشروعك <span style="color:{YELLOW}">يبرز</span> 🔥</div>'))

    # D1-P2 — carousel
    render("D1-P2-01-cover", mesh="purple", seed=1, inner=
           '<div class="ar" style="position:absolute;inset:0;padding:140px 80px 0;text-align:center">'
           '<div style="font:800 320px/1 Poppins;text-shadow:0 20px 60px rgba(0,0,0,.45)">4</div>'
           '<div style="font:800 100px/1.25 Tajawal;margin-top:20px">خدمات تخلّي<br>مشروعك <span class="hl">يكبر</span></div>'
           '<div class="sticker" style="position:relative;display:inline-block;margin-top:70px;transform:rotate(-3deg);font-family:Tajawal">اسحب وشوف ←</div></div>')
    slides = [
        ("02-services", "designer.jpg", "01", "حساباتك علينا 💪", "نخطط · نصمم · ننشر · ونرد على عملائك"),
        ("03-ads", "ads.jpg", "02", "إعلانات تجيب عملاء 🎯", "استهداف صح · ميزانية مدروسة · تقرير واضح"),
        ("04-reels", "creator.jpg", "03", "ريلز تخطف العين 🎬", "فكرة · تصوير أو ذكاء اصطناعي · مونتاج"),
    ]
    for key, photo, n, title, sub in slides:
        render(f"D1-P2-{key}", photo=photo, inner=
               f'<div style="position:absolute;top:80px;right:60px;font:800 120px Poppins;color:rgba(255,255,255,.85);text-shadow:0 8px 30px rgba(0,0,0,.5)">{n}</div>'
               + bottom(f'<div style="font:800 88px/1.2 Tajawal">{title}</div>'
                        f'<div style="font:700 44px/1.6 Tajawal;margin-top:20px;opacity:.95">{sub}</div>'))
    render("D1-P2-05-brand", mesh="launch", seed=0, inner=
           f'<div style="position:absolute;top:90px;left:80px;font:800 150px Poppins;color:rgba(255,255,255,.22)">04</div>'
           f'<div class="ar" style="position:absolute;inset:0;padding:190px 80px 0;display:flex;flex-direction:column;align-items:center;text-align:center">'
           f'{big_icon("brand", 220)}<div style="font:800 92px/1.6 Tajawal;margin-top:50px">هوية <span class="hl" style="padding:6px 18px 0">تبيّض الوجه</span> ✨</div>'
           f'<div style="margin-top:36px"><span class="chip">شعار</span><span class="chip">ألوان وخطوط</span><span class="chip">جاهزة لكل مكان</span></div></div>')

    # D1-P4 — how we start (photo)
    render("D1-P4-how-we-start", photo="cafe.jpg", inner=
           f'<div class="sticker" style="top:90px;right:60px;transform:rotate(5deg);font-family:Tajawal">عرض الإطلاق 🎁</div>'
           + bottom('<div style="font:800 96px/1.15 Tajawal">تبي تبدأ؟ <span style="color:#FFD23F">بسيطة</span> 👌</div>'
                    '<div style="margin-top:24px"><span class="chip">1 نسمعك</span><span class="chip">2 نخطط</span><span class="chip">3 ننفذ</span></div>'
                    '<div style="font:700 40px/1.5 Tajawal;margin-top:22px">مراجعة <span class="hl">مجانية</span> لحساباتك + 3 توصيات</div>'
                    f'<div style="margin-top:26px;display:inline-block;background:{YELLOW};color:#111;font:800 46px Tajawal;padding:20px 46px;'
                    'border-radius:999px;box-shadow:0 12px 0 rgba(0,0,0,.25)">كلمنا واتساب الحين</div>', pad=140))

    files = sorted(f for f in os.listdir(POSTS) if f.endswith(".jpg"))
    thumbs = [Image.open(os.path.join(POSTS, f)).resize((300, 375)) for f in files]
    sheet = Image.new("RGB", (310 * 4 + 10, 385 * 2 + 10), (20, 20, 20))
    for i, t in enumerate(thumbs):
        sheet.paste(t, (10 + (i % 4) * 310, 10 + (i // 4) * 385))
    sheet.save(os.path.join(POSTS, "_preview.png"))
    print(files)


if __name__ == "__main__":
    main()
