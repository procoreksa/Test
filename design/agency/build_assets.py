"""Build Pro Core Media black & gold identity assets.

Writes SVG/HTML sources to design/agency/src and renders PNGs to design/agency/out
with headless Chromium. Usage: python3 build_assets.py [chromium-path]
"""
import os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC, OUT = os.path.join(HERE, "src"), os.path.join(HERE, "out")
FONTS = os.path.join(HERE, "..", "launch-post", "fonts")
CHROME = sys.argv[1] if len(sys.argv) > 1 else "/opt/pw-browsers/chromium"

# ---------------- palette ----------------
BLACK, ONYX, CHARCOAL = "#050505", "#0E0D0B", "#1A1814"
GOLD, GOLD_DEEP, CHAMPAGNE, IVORY = "#D4AF37", "#A67C1E", "#F3E2A9", "#F6F1E4"

# ---------------- mark geometry (same P/play mark as the colour logo) ----------------
OUTLINE = ("M44 110 C44 50 90 18 140 22 L410 152 C478 186 478 284 420 315 "
           "L300 385 C270 400 240 405 197 405 L197 452 C197 476 178 494 154 494 "
           "L70 494 C55 494 44 483 44 468 Z")
HOLE = ("M174 154 Q174 134 191.4 143.9 L345.6 232.1 Q363 242 345.2 251.2 "
        "L191.8 330.8 Q174 340 174 320 Z")
SHAPE = OUTLINE + " " + HOLE
RIBBONS = [  # same ribbon layout, recoloured as metallic gold facets
    ("a", "M0 0 L512 0 L512 512 L300 512 L174 140 Z", (120, 20, 460, 290, ["#F7E7B0", "#D9B25A", "#B8862B"]), False),
    ("b", "M174 340 L360 245 C385 262 425 292 512 338 L512 512 L174 512 Z", (450, 290, 200, 395, ["#E9CB7C", "#C49A45", "#7E5A1C"]), True),
    ("c", "M0 0 L120 0 C165 15 178 80 174 134 L174 512 L0 512 Z", (0, 20, 0, 300, ["#8A6424", "#C29437"]), True),
    ("d", "M0 118 C100 148 186 212 178 268 C172 320 92 352 0 400 Z", (44, 0, 185, 0, ["#FFF3C9", "#E0BB63"]), False),
    ("e", "M0 432 C70 382 140 350 176 300 L176 340 C200 370 208 430 215 512 L0 512 Z", (40, 470, 200, 320, ["#5E4214", "#A27A2E"]), True),
    ("f", "M0 492 C60 442 140 410 262 402 L262 512 L0 512 Z", (44, 494, 220, 410, ["#C9A04A", "#F1D88E"]), True),
]


def mark_svg(p="g", mono=None):
    """Return (defs, body) for the 512x512 mark."""
    if mono:
        return "", f'<path fill="{mono}" fill-rule="evenodd" d="{SHAPE}"/>'
    defs = []
    for rid, _, (x1, y1, x2, y2, stops), _ in RIBBONS:
        st = "".join(f'<stop offset="{i/(len(stops)-1):.2f}" stop-color="{c}"/>' for i, c in enumerate(stops))
        defs.append(f'<linearGradient id="{p}{rid}" gradientUnits="userSpaceOnUse" x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}">{st}</linearGradient>')
    defs.append(f'<filter id="{p}fold" filterUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">'
                f'<feDropShadow dx="2" dy="-1" stdDeviation="8" flood-color="#000" flood-opacity=".45"/></filter>')
    defs.append(f'<mask id="{p}m" maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">'
                f'<path fill="#fff" fill-rule="evenodd" d="{SHAPE}"/></mask>')
    layers = "".join(f'<path d="{d}" fill="url(#{p}{rid})"{f" filter=\"url(#{p}fold)\"" if sh else ""}/>'
                     for rid, d, _, sh in RIBBONS)
    return "".join(defs), f'<g mask="url(#{p}m)">{layers}</g>'


def standalone_mark(p, mono=None):
    defs, body = mark_svg(p, mono)
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs>{defs}</defs>{body}</svg>'


FONT_CSS = f"""
@font-face {{ font-family: Poppins; font-weight: 500; src: url({FONTS}/Poppins-Medium.ttf); }}
@font-face {{ font-family: Poppins; font-weight: 600; src: url({FONTS}/Poppins-SemiBold.ttf); }}
@font-face {{ font-family: Poppins; font-weight: 700; src: url({FONTS}/Poppins-Bold.ttf); }}
@font-face {{ font-family: Tajawal; font-weight: 500; src: url({FONTS}/Tajawal-Medium.ttf); }}
@font-face {{ font-family: Tajawal; font-weight: 700; src: url({FONTS}/Tajawal-Bold.ttf); }}
@font-face {{ font-family: Tajawal; font-weight: 800; src: url({FONTS}/Tajawal-ExtraBold.ttf); }}
* {{ margin: 0; padding: 0; box-sizing: border-box; }}
"""

GOLD_TEXT = (f"background: linear-gradient(180deg, {CHAMPAGNE} 0%, {GOLD} 55%, {GOLD_DEEP} 100%);"
             "-webkit-background-clip: text; background-clip: text; color: transparent;")


def page(w, h, body, extra_css=""):
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>{FONT_CSS}
html, body {{ width: {w}px; height: {h}px; background: {BLACK}; overflow: hidden; }}
{extra_css}</style></head><body>{body}</body></html>"""


def render(name, html, w, h):
    src = os.path.join(SRC, name + ".html")
    open(src, "w").write(html)
    out = os.path.join(OUT, name + ".png")
    subprocess.run([CHROME, "--headless", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
                    "--allow-file-access-from-files", "--virtual-time-budget=3000",
                    f"--window-size={w},{h + 200}", f"--screenshot={out}", "file://" + src],
                   capture_output=True)
    from PIL import Image
    Image.open(out).convert("RGB").crop((0, 0, w, h)).save(out)
    print("rendered", name)


def wordmark(size, sub=True, align="center"):
    tag = (f'<div style="font: 500 {size*0.24:.0f}px Poppins; letter-spacing: {size*0.17:.0f}px; color: {IVORY}; '
           f'opacity:.75; margin-top:{size*0.18:.0f}px">CREATIVE · AI · PERFORMANCE</div>') if sub else ""
    return (f'<div style="text-align:{align}"><div style="font: 600 {size}px Poppins; letter-spacing: {size*0.12:.0f}px; {GOLD_TEXT}">'
            f'PRO CORE MEDIA</div>{tag}</div>')


ICONS = {  # 48x48 line icons, stroked in gold
    "services": '<rect x="7" y="7" width="14" height="14" rx="3"/><rect x="27" y="7" width="14" height="14" rx="3"/><rect x="7" y="27" width="14" height="14" rx="3"/><rect x="27" y="27" width="14" height="14" rx="3"/>',
    "work": '<rect x="6" y="9" width="36" height="30" rx="4"/><path d="M6 32l10-10 8 8 6-6 12 12"/><circle cx="32" cy="18" r="3"/>',
    "ai": '<path d="M24 5l4 11 11 4-11 4-4 11-4-11-11-4 11-4z"/><path d="M38 31l1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5 4-1.5z"/>',
    "packages": '<path d="M24 5l17 9v20l-17 9-17-9V14z"/><path d="M7 14l17 9 17-9M24 23v20"/>',
    "contact": '<path d="M8 10h32a3 3 0 0 1 3 3v18a3 3 0 0 1-3 3H22l-9 7v-7H8a3 3 0 0 1-3-3V13a3 3 0 0 1 3-3z"/><path d="M15 20h18M15 26h11"/>',
    "about": None,  # uses the mark
}
HIGHLIGHTS = [("services", "الخدمات", "Services"), ("work", "أعمالنا", "Work"), ("ai", "AI", "AI Studio"),
              ("packages", "الباقات", "Packages"), ("contact", "تواصل", "Contact"), ("about", "من نحن", "About")]


def main():
    os.makedirs(SRC, exist_ok=True)
    os.makedirs(OUT, exist_ok=True)

    # 1) mark SVGs
    for name, mono in (("procore-media-mark-gold", None), ("procore-media-mark-gold-flat", GOLD),
                       ("procore-media-mark-black", BLACK), ("procore-media-mark-ivory", IVORY)):
        open(os.path.join(OUT, name + ".svg"), "w").write(standalone_mark("m", mono))
    defs, body = mark_svg("g")
    mark_inline = lambda size: f'<svg viewBox="0 0 512 512" width="{size}" height="{size}"><defs>{defs}</defs>{body}</svg>'

    # 2) profile picture 1080x1080 (circle-crop safe)
    render("profile-picture", page(1080, 1080,
        f'<div style="width:1080px;height:1080px;display:grid;place-items:center;'
        f'background: radial-gradient(circle at 50% 45%, #1c1912 0%, {ONYX} 45%, {BLACK} 75%)">{mark_inline(600)}</div>'), 1080, 1080)

    # 3) Facebook cover 1640x624 (key content kept in the centre safe zone)
    lines = "".join(f'<div style="position:absolute;top:-200px;left:{x}px;width:1px;height:1100px;'
                    f'background:linear-gradient({GOLD}00,{GOLD}55,{GOLD}00);transform:rotate(32deg)"></div>'
                    for x in range(-200, 1800, 140))
    render("facebook-cover", page(1640, 624,
        f'<div style="position:relative;width:1640px;height:624px;overflow:hidden;'
        f'background: radial-gradient(ellipse at 50% 50%, #17140e 0%, {BLACK} 70%)">{lines}'
        f'<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:56px">'
        f'{mark_inline(250)}<div>{wordmark(68)}'
        f'<div dir="rtl" style="font:700 40px Tajawal;color:{IVORY};margin-top:30px;text-align:center">'
        f'حيث يلتقي الإبداع <span style="{GOLD_TEXT}">بالابتكار</span></div></div></div></div>'), 1640, 624)

    # 4) Instagram highlight covers 1080x1920 (icon centred — Instagram crops to a circle)
    for key, ar, en in HIGHLIGHTS:
        icon = mark_inline(520) if ICONS[key] is None else (
            f'<svg viewBox="0 0 48 48" width="480" height="480" fill="none" stroke="url(#hg)" stroke-width="2.4" '
            f'stroke-linecap="round" stroke-linejoin="round"><defs><linearGradient id="hg" x1="0" y1="0" x2="0" y2="1">'
            f'<stop offset="0" stop-color="{CHAMPAGNE}"/><stop offset="1" stop-color="{GOLD_DEEP}"/></linearGradient></defs>{ICONS[key]}</svg>')
        render(f"highlight-{key}", page(1080, 1920,
            f'<div style="width:1080px;height:1920px;display:grid;place-items:center;'
            f'background: radial-gradient(circle at 50% 50%, #1c1912 0%, {BLACK} 55%)">'
            f'<div style="width:900px;height:900px;border-radius:50%;border:6px solid {GOLD}55;display:grid;place-items:center">{icon}</div></div>'),
            1080, 1920)

    # 5) contact sheet for review
    from PIL import Image, ImageDraw, ImageFont
    sheet = Image.new("RGB", (1640, 1240), BLACK)
    sheet.paste(Image.open(os.path.join(OUT, "facebook-cover.png")), (0, 0))
    pp = Image.open(os.path.join(OUT, "profile-picture.png")).resize((400, 400))
    m = Image.new("L", (400, 400), 0)
    ImageDraw.Draw(m).ellipse((0, 0, 399, 399), fill=255)
    sheet.paste(pp, (40, 680), m)
    f = ImageFont.truetype(os.path.join(FONTS, "Tajawal-Bold.ttf"), 30)
    for i, (key, ar, en) in enumerate(HIGHLIGHTS):
        h = Image.open(os.path.join(OUT, f"highlight-{key}.png")).crop((0, 420, 1080, 1500)).resize((170, 170))
        hm = Image.new("L", (170, 170), 0)
        ImageDraw.Draw(hm).ellipse((0, 0, 169, 169), fill=255)
        x = 500 + i * 185
        sheet.paste(h, (x, 760), hm)
        ImageDraw.Draw(sheet).text((x + 85, 960), ar, font=f, fill=IVORY, anchor="ma")
    sheet.save(os.path.join(OUT, "_preview-sheet.png"))
    print("done")


if __name__ == "__main__":
    main()
