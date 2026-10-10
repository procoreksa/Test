"""Day 1 launch Reel (12s, 1080x1920, 30fps) in the vivid style.

Static layers are rendered once with headless Chromium (transparent PNGs), then animated
with Pillow and encoded with ffmpeg. Usage: python3 build_reel_launch.py
"""
import math, os, subprocess
from PIL import Image
from build_assets import FONT_CSS, CHROME, SRC, OUT
from build_vivid import MESHES, BASE, WA_ICON, YELLOW, WA

W, H, FPS, DUR = 1080, 1920, 30, 12.0
MARK = os.path.join(OUT, "procore-media-mark-color.png")
TMP = os.path.join(OUT, "reel-layers")
DEST = os.path.join(OUT, "posts-v2", "D1-P3-launch-reel.mp4")


def shot(name, w, h, body, bg="transparent"):
    html = (f'<!doctype html><html><head><meta charset="utf-8"><style>{BASE} html,body{{width:{w}px;height:{h}px;background:{bg}}}</style>'
            f'</head><body>{body}</body></html>')
    src = os.path.join(SRC, f"reel-{name}.html")
    open(src, "w").write(html)
    out = os.path.join(TMP, f"{name}.png")
    subprocess.run([CHROME, "--headless", "--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--allow-file-access-from-files",
                    "--default-background-color=00000000", "--virtual-time-budget=2000", f"--window-size={w},{h + 200}",
                    f"--screenshot={out}", "file://" + src], capture_output=True)
    img = Image.open(out).convert("RGBA").crop((0, 0, w, h))
    img.save(out)
    return img


def ease_out_back(x):
    x = max(0.0, min(1.0, x))
    c1, c3 = 1.70158, 2.70158
    return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2


def ease(x):
    x = max(0.0, min(1.0, x))
    return 1 - (1 - x) ** 3


def place(frame, layer, cx, cy, scale=1.0, angle=0.0, alpha=1.0):
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


def main():
    os.makedirs(TMP, exist_ok=True)
    bg = shot("bg", 1300, 2300, f'<div class="p" style="width:1300px;height:2300px;background:{MESHES["launch"]}">'
              '<div class="ring" style="left:-200px;top:200px;width:700px;height:700px"></div>'
              '<div class="ring" style="left:800px;top:1500px;width:640px;height:640px"></div>'
              '<div class="spark" style="left:200px;top:500px">✦</div><div class="spark" style="left:1000px;top:800px">✦</div>'
              '<div class="spark" style="left:260px;top:1700px">✦</div><div class="noise"></div></div>', bg="#000").convert("RGB")
    mark = Image.open(MARK).convert("RGBA").resize((640, 640), Image.LANCZOS)
    sticker = shot("sticker", 460, 140, f'<div class="sticker" style="position:static;display:inline-block;margin:20px">NOW LIVE 🚀</div>')
    title = shot("title", 1000, 200, f'<div class="ar" style="font:800 150px/1.2 Tajawal;color:#fff;text-align:center">انطلقنا<span style="color:{YELLOW}">!</span></div>')
    brand = shot("brand", 1000, 170, '<div style="text-align:center"><span class="hl" style="font:800 96px/1.4 Poppins">ProCore Media</span></div>')
    tag = shot("tag", 1000, 120, '<div class="ar" style="font:700 58px Tajawal;color:#fff;text-align:center">إبداع · ذكاء اصطناعي · نتائج تُقاس</div>')
    cta = shot("cta", 900, 200, f'<div style="text-align:center;padding-top:20px"><span class="ar" style="display:inline-block;background:{YELLOW};color:#111;'
               f'font:800 60px Tajawal;padding:28px 60px;border-radius:999px;box-shadow:0 14px 0 rgba(0,0,0,.25)">احجز استشارتك الآن</span></div>')
    foot = shot("foot", 1000, 120, f'<div style="display:flex;justify-content:center;gap:30px;align-items:center;font:600 40px Poppins;color:#fff">'
                f'<div style="display:flex;align-items:center;gap:14px;background:rgba(0,0,0,.35);padding:16px 30px;border-radius:999px">{WA_ICON}<span>{WA}</span></div>'
                f'<span>@procore.media</span></div>')

    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
           "-f", "lavfi", "-i", f"anullsrc=r=44100:cl=stereo", "-t", str(DUR),
           "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-pix_fmt", "yuv420p",
           "-c:a", "aac", "-b:a", "128k", "-shortest", "-movflags", "+faststart", DEST]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for i in range(int(DUR * FPS)):
        t = i / FPS
        # slow Ken Burns on the background
        z = 1.0 + 0.06 * (t / DUR)
        cw, ch = int(W / z), int(H / z)
        ox = int((1300 - cw) / 2 + 40 * math.sin(t / 3))
        oy = int((2300 - ch) / 2 - 60 * (t / DUR))
        frame = bg.crop((ox, oy, ox + cw, oy + ch)).resize((W, H), Image.BICUBIC).convert("RGBA")
        # mark flies in, then breathes
        m = ease_out_back(t / 1.4)
        breathe = 1 + 0.025 * math.sin(max(0, t - 1.4) * 2.4)
        place(frame, mark, W / 2, 640 - 200 * (1 - ease(t / 1.4)), scale=(0.25 + 0.75 * m) * breathe,
              angle=-25 + 31 * ease(t / 1.4), alpha=ease(t / 0.4))
        place(frame, sticker, 300, 260, scale=ease_out_back((t - 1.5) / 0.5), angle=8, alpha=ease((t - 1.5) / 0.2))
        place(frame, title, W / 2, 1100 + 80 * (1 - ease((t - 2.4) / 0.6)), alpha=ease((t - 2.4) / 0.5))
        place(frame, brand, W / 2, 1290, scale=0.8 + 0.2 * ease_out_back((t - 3.4) / 0.6), alpha=ease((t - 3.4) / 0.4))
        place(frame, tag, W / 2, 1440, alpha=ease((t - 4.5) / 0.6))
        place(frame, cta, W / 2, 1620, scale=ease_out_back((t - 8.2) / 0.6), alpha=ease((t - 8.2) / 0.3))
        place(frame, foot, W / 2, 1800 + 60 * (1 - ease((t - 8.8) / 0.6)), alpha=ease((t - 8.8) / 0.5))
        fade = min(1.0, t / 0.3, (DUR - t) / 0.4)
        out = frame.convert("RGB")
        if fade < 1:
            out = Image.blend(Image.new("RGB", (W, H)), out, max(0.0, fade))
        p.stdin.write(out.tobytes())
    p.stdin.close()
    p.wait()
    # cover image for the Reel
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", "10", "-i", DEST, "-frames:v", "1", "-q:v", "2",
                    DEST.replace(".mp4", "-cover.jpg")])
    print("ok", DEST)


if __name__ == "__main__":
    main()
