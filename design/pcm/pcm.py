"""Shared template for the PCM-CHATGPT-LAUNCH-2026-10 campaign.

Identity per the campaign package: official logo (assets/official_logo.png, used as-is — only
cropped and screen-blended so its black backdrop disappears on dark navy), navy-black base,
neon gradient blue → cyan → purple → magenta → orange → yellow, slogan
«حيث يلتقي الإبداع بالابتكار» / WHERE CREATIVITY MEETS INNOVATION, Tajawal + Poppins.
"""
import os, subprocess
from PIL import Image, ImageChops
import sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "agency"))
from build_assets import FONT_CSS  # noqa: E402
CHROME = "/opt/pw-browsers/chromium"

HERE = os.path.dirname(os.path.abspath(__file__))
PHOTOS = os.path.join(HERE, "photos")
OUT = os.path.join(HERE, "out")
SRC = os.path.join(HERE, "src")
LOGO = os.path.join(HERE, "assets", "logo_lockup.png")
W, H = 1080, 1350
GRAD = "linear-gradient(90deg,#2F6BFF,#14C8FF,#8B1FE8,#F2349E,#FF8A00,#FFD23F)"
YELLOW = "#FFD23F"
WA = "0594943048"

CSS = FONT_CSS + f"""
* {{ margin:0; padding:0; box-sizing:border-box; }}
body {{ background:#050817; }}
.p {{ position:relative; width:{W}px; height:{H}px; overflow:hidden; color:#fff; background:#050817; font-family:Tajawal; }}
.ar {{ direction:rtl; }}
.photo {{ position:absolute; left:0; right:0; top:0; background-size:cover; background-position:center; }}
.fade {{ position:absolute; inset:0; background:linear-gradient(180deg, rgba(5,8,23,.55) 0%, rgba(5,8,23,0) 22%, rgba(5,8,23,0) 42%, rgba(5,8,23,.85) 66%, #050817 82%); }}
.glow {{ position:absolute; border-radius:50%; filter:blur(90px); opacity:.55; }}
.logo {{ position:absolute; top:34px; right:44px; width:250px; mix-blend-mode:screen; }}
.logo.c {{ right:auto; left:50%; transform:translateX(-50%); }}
.gt {{ background:{GRAD}; -webkit-background-clip:text; background-clip:text; color:transparent; }}
.bar {{ height:6px; border-radius:6px; background:{GRAD}; }}
.foot {{ position:absolute; left:0; right:0; bottom:34px; text-align:center; }}
.foot .s {{ font:700 30px Tajawal; color:#7FD6FF; direction:rtl; }}
.foot .e {{ font:600 15px Poppins; letter-spacing:6px; color:#c9cfe6; margin-top:6px; }}
.foot .ln {{ display:flex; align-items:center; justify-content:center; gap:22px; }}
.foot .ln i {{ display:block; width:150px; height:2px; background:{GRAD}; opacity:.8; }}
.corner {{ position:absolute; bottom:0; width:420px; height:120px; opacity:.9; }}
.badge {{ position:absolute; top:44px; left:44px; font:700 22px Tajawal; color:#111; background:{YELLOW}; padding:8px 18px; border-radius:999px; direction:rtl; }}
.ai {{ position:absolute; font:600 18px Poppins; color:#fff; background:rgba(0,0,0,.45); padding:6px 14px; border-radius:999px; }}
.card {{ background:rgba(255,255,255,.07); border:1.5px solid rgba(255,255,255,.18); border-radius:28px; }}
.chip {{ display:inline-block; padding:10px 24px; margin:6px 5px; border-radius:999px; font:700 30px Tajawal;
  background:rgba(255,255,255,.08); border:1.5px solid rgba(255,255,255,.25); }}
.num {{ font:700 64px Poppins; }}
.btn {{ display:inline-block; background:{GRAD}; color:#fff; font:800 40px Tajawal; padding:18px 44px; border-radius:999px; }}
"""

CORNERS = (f'<svg class="corner" style="left:0" viewBox="0 0 420 120"><path d="M0 120 L0 40 Q120 70 420 120 Z" fill="url(#g1)"/>'
           f'<defs><linearGradient id="g1"><stop offset="0" stop-color="#2F6BFF"/><stop offset=".5" stop-color="#8B1FE8"/>'
           f'<stop offset="1" stop-color="#F2349E" stop-opacity="0"/></linearGradient></defs></svg>'
           f'<svg class="corner" style="right:0" viewBox="0 0 420 120"><path d="M420 120 L420 40 Q300 70 0 120 Z" fill="url(#g2)"/>'
           f'<defs><linearGradient id="g2" x1="1" x2="0"><stop offset="0" stop-color="#FFD23F"/><stop offset=".5" stop-color="#FF8A00"/>'
           f'<stop offset="1" stop-color="#F2349E" stop-opacity="0"/></linearGradient></defs></svg>')


def foot():
    return ('<div class="foot"><div class="ln"><i></i><div class="s">حيث يلتقي الإبداع بالابتكار</div><i></i></div>'
            '<div class="e">WHERE CREATIVITY MEETS INNOVATION</div></div>')


def logo(center=False, width=250, top=34):
    pos = "left:50%;transform:translateX(-50%)" if center else "right:4px"
    halo = (f'<div style="position:absolute;top:{top - 40}px;{pos};width:{width + 80}px;height:{int(width * .89) + 80}px;'
            f'background:radial-gradient(closest-side,rgba(5,8,23,.92),rgba(5,8,23,.6) 60%,rgba(5,8,23,0));"></div>')
    return halo + f'<img class="logo{" c" if center else ""}" style="width:{width}px;top:{top}px" src="file://{LOGO}">'


def glows(seed=0):
    sets = [[("#2F6BFF", -120, 200, 520), ("#F2349E", 760, 760, 520), ("#8B1FE8", 300, 1100, 420)],
            [("#8B1FE8", 700, 120, 520), ("#14C8FF", -160, 700, 520), ("#FF8A00", 640, 1150, 380)],
            [("#F2349E", -100, 900, 500), ("#2F6BFF", 760, 300, 520), ("#FFD23F", 500, 1200, 300)]]
    return "".join(f'<div class="glow" style="background:{c};left:{x}px;top:{y}px;width:{s}px;height:{s}px"></div>'
                   for c, x, y, s in sets[seed % 3])


def concept_badge():
    return '<div class="badge">نموذج تصوري — ليس مشروعًا لعميل</div>'


def render(name, inner, photo=None, photo_h=900, seed=0, logo_center=False, show_logo=True, ai=True, size=(W, H)):
    w, h = size
    if photo:
        bg = (f'<div class="photo" style="height:{photo_h}px;background-image:url(file://{os.path.join(PHOTOS, photo)})"></div>'
              f'<div class="fade" style="height:{photo_h + 40}px"></div>')
        if ai:
            bg += f'<div class="ai" style="top:{photo_h - 70}px;left:44px">AI visual</div>'
    else:
        bg = glows(seed)
    html = (f'<!doctype html><html><head><meta charset="utf-8"><style>{CSS} .p{{width:{w}px;height:{h}px}}</style></head><body>'
            f'<div class="p">{bg}{CORNERS}{logo(logo_center) if show_logo else ""}{inner}{foot()}</div></body></html>')
    os.makedirs(SRC, exist_ok=True)
    os.makedirs(OUT, exist_ok=True)
    src = os.path.join(SRC, f"{name}.html")
    open(src, "w").write(html)
    png = os.path.join(OUT, f"{name}.png")
    subprocess.run([CHROME, "--headless", "--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--allow-file-access-from-files",
                    "--virtual-time-budget=3000", f"--window-size={w},{h + 200}", f"--screenshot={png}", "file://" + src],
                   capture_output=True)
    Image.open(png).convert("RGB").crop((0, 0, w, h)).save(png.replace(".png", ".jpg"), quality=92)
    os.remove(png)
    print("rendered", name)
    return png.replace(".png", ".jpg")


def shot(name, w, h, body):
    """Transparent PNG layer for Reels."""
    html = (f'<!doctype html><html><head><meta charset="utf-8"><style>{CSS} html,body{{width:{w}px;height:{h}px;background:transparent}}'
            f'</style></head><body>{body}</body></html>')
    os.makedirs(os.path.join(OUT, "layers"), exist_ok=True)
    src = os.path.join(SRC, f"layer-{name}.html")
    open(src, "w").write(html)
    png = os.path.join(OUT, "layers", f"{name}.png")
    subprocess.run([CHROME, "--headless", "--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--allow-file-access-from-files",
                    "--default-background-color=00000000", "--virtual-time-budget=2000", f"--window-size={w},{h + 200}",
                    f"--screenshot={png}", "file://" + src], capture_output=True)
    img = Image.open(png).convert("RGBA").crop((0, 0, w, h))
    img.save(png)
    return img


def logo_layer(width):
    """Official logo for Reels: black backdrop turned into alpha via its own luminance (screen-equivalent)."""
    l = Image.open(LOGO).convert("RGB")
    l = l.resize((width, int(l.height * width / l.width)), Image.LANCZOS)
    alpha = l.convert("L").point(lambda v: min(255, v * 3))
    out = l.convert("RGBA")
    out.putalpha(alpha)
    return out


def screen(base, layer, xy):
    """Screen-blend an RGB layer onto base (used for the logo in video frames)."""
    region = base.crop((xy[0], xy[1], xy[0] + layer.width, xy[1] + layer.height)).convert("RGB")
    base.paste(ImageChops.screen(region, layer.convert("RGB")), xy)


def ease(x):
    x = max(0.0, min(1.0, x))
    return 1 - (1 - x) ** 3


def ease_out_back(x):
    x = max(0.0, min(1.0, x))
    c1, c3 = 1.70158, 2.70158
    return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2


def place(frame, layer, cx, cy, scale=1.0, alpha=1.0, angle=0.0):
    if alpha <= 0 or scale <= 0.01:
        return
    l = layer
    if scale != 1.0:
        l = l.resize((max(1, int(l.width * scale)), max(1, int(l.height * scale))), Image.BICUBIC)
    if angle:
        l = l.rotate(angle, resample=Image.BICUBIC, expand=True)
    if alpha < 1:
        a = l.getchannel("A").point(lambda v: int(v * alpha))
        l = l.copy()
        l.putalpha(a)
    frame.alpha_composite(l, (int(cx - l.width / 2), int(cy - l.height / 2)))


def encode(frames_iter, dest, fps=30, dur=15.0, w=1080, h=1920):
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{w}x{h}", "-r", str(fps), "-i", "-",
           "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-t", str(dur),
           "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-pix_fmt", "yuv420p",
           "-c:a", "aac", "-b:a", "128k", "-shortest", "-movflags", "+faststart", dest]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for fr in frames_iter:
        p.stdin.write(fr.tobytes())
    p.stdin.close()
    p.wait()


def cover_from(video, t, dest):
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", str(t), "-i", video, "-frames:v", "1", "-q:v", "2", dest])


def fit(path, w=1080, h=1920, extra=1.12):
    im = Image.open(path).convert("RGB")
    s = max(w / im.width, h / im.height) * extra
    return im.resize((int(im.width * s), int(im.height * s)), Image.LANCZOS)


def kb(im, z, dx=0, dy=0, w=1080, h=1920):
    """Ken Burns crop of a pre-fitted image."""
    cw, ch = int(w / z), int(h / z)
    ox = max(0, min(im.width - cw, (im.width - cw) // 2 + dx))
    oy = max(0, min(im.height - ch, (im.height - ch) // 2 + dy))
    return im.crop((ox, oy, ox + cw, oy + ch)).resize((w, h), Image.BICUBIC)
