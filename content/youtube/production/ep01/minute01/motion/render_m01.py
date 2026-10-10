"""Render Minute 1 of episode 01 as a motion-graphics video synced to the Orion VO.

Usage: python3 render_m01.py <vo.mp3> <out.mp4> [--fps 24] [--preview SECONDS]
Frames are drawn with Pillow/numpy and piped straight into ffmpeg.
"""
import argparse, math, os, random, subprocess
import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
FONTS = os.path.join(HERE, "..", "..", "..", "fonts")
W, H = 1920, 1080
DURATION = 48.4

BG = (11, 11, 20)
INK = (240, 240, 245)
MUTED = (138, 143, 163)
RED = (229, 51, 59)
GOLD = (242, 179, 61)
GREEN = (46, 204, 113)


def font(name, size):
    return ImageFont.truetype(os.path.join(FONTS, name), size)


ANTON = lambda s: font("Anton-Regular.ttf", s)
POP = lambda s: font("Poppins-Medium.ttf", s)
POPB = lambda s: font("Poppins-Bold.ttf", s)
MONO = lambda s: font("LiberationMono-Bold.ttf", s)


def clamp(x, a=0.0, b=1.0):
    return max(a, min(b, x))


def ease(x):  # easeOutCubic
    x = clamp(x)
    return 1 - (1 - x) ** 3


def prog(t, start, dur):
    return ease((t - start) / dur)


def text_center(d, xy, s, f, fill, alpha=1.0, anchor="mm"):
    if alpha <= 0:
        return
    c = tuple(int(v * alpha + b * (1 - alpha)) for v, b in zip(fill, BG))
    d.text(xy, s, font=f, fill=c, anchor=anchor)


def blend(fill, alpha):
    return tuple(int(v * alpha + b * (1 - alpha)) for v, b in zip(fill, BG))


# ---------- scenes (times are global seconds, matched to VO pauses) ----------

def s_disclaimer(img, d, t):
    # 0.0 – 8.4: typewriter quote
    l1 = "This whole story is completely true."
    l2 = "Except for all of the parts that are totally made up."
    f = POPB(64)
    n1 = int(clamp((t - 3.7) / 1.6) * len(l1))
    n2 = int(clamp((t - 5.7) / 2.2) * len(l2))
    a0 = prog(t, 0.3, 0.8)
    text_center(d, (W // 2, 330), "EVERY EPISODE OF INVENTING ANNA OPENED WITH:", MONO(30), MUTED, a0)
    d.text((W // 2, 500), l1[:n1], font=f, fill=INK, anchor="mm")
    d.text((W // 2, 600), l2[:n2], font=f, fill=RED, anchor="mm")
    if 3.7 < t < 8.2 and int(t * 2) % 2 == 0:  # blinking cursor
        line, y, s = (l2, 600, l2[:n2]) if n2 else (l1, 500, l1[:n1])
        x = W // 2 + d.textlength(s, font=f) / 2 - d.textlength(line, font=f) / 2 + d.textlength(s, font=f) / 2
        d.rectangle([x + 6, y - 34, x + 12, y + 34], fill=INK)
    text_center(d, (W // 2, 720), "— NETFLIX, 2022", MONO(28), MUTED, prog(t, 7.0, 0.8))


def s_sentence(img, d, t):
    # 8.4 – 12.0: punchline
    a = prog(t, 8.6, 0.6)
    size = int(96 + 10 * clamp((t - 8.4) / 3.6))
    text_center(d, (W // 2, 470), "THE MOST ANNA DELVEY SENTENCE", ANTON(size), INK, a)
    text_center(d, (W // 2, 590), "EVER WRITTEN.", ANTON(size), GOLD, prog(t, 9.6, 0.5))


def s_agenda(img, d, t):
    # 12.0 – 19.8: three cards
    text_center(d, (W // 2, 230), "TODAY", MONO(34), MUTED, prog(t, 12.2, 0.5))
    cards = [(13.2, "WHAT NETFLIX", "GOT RIGHT", GREEN, "check"), (14.7, "WHAT NETFLIX", "INVENTED", RED, "cross"),
             (16.0, "WHAT'S EVEN", "CRAZIER", GOLD, "bang")]
    cw, ch, gap = 500, 420, 60
    x0 = (W - (3 * cw + 2 * gap)) // 2
    for i, (st, a, b, col, mark) in enumerate(cards):
        p = prog(t, st, 0.7)
        if p <= 0:
            continue
        x = x0 + i * (cw + gap)
        y = 340 + int(60 * (1 - p))
        d.rounded_rectangle([x, y, x + cw, y + ch], 28, fill=blend((24, 24, 38), p), outline=blend(col, p), width=4)
        d.ellipse([x + cw // 2 - 55, y + 50, x + cw // 2 + 55, y + 160], fill=blend(col, p))
        cx, cy = x + cw // 2, y + 105
        mk = BG if p > .5 else blend(col, p)
        if mark == "check":
            d.line([cx - 28, cy + 2, cx - 8, cy + 24, cx + 30, cy - 22], fill=mk, width=12, joint="curve")
        elif mark == "cross":
            d.line([cx - 24, cy - 24, cx + 24, cy + 24], fill=mk, width=12)
            d.line([cx - 24, cy + 24, cx + 24, cy - 24], fill=mk, width=12)
        else:
            d.rectangle([cx - 6, cy - 32, cx + 6, cy + 10], fill=mk)
            d.ellipse([cx - 8, cy + 20, cx + 8, cy + 36], fill=mk)
        text_center(d, (x + cw // 2, y + 240), a, ANTON(52), INK, p)
        text_center(d, (x + cw // 2, y + 310), b, ANTON(64), col, p)


def stamp(img, t, start, text, xy, col=RED, size=70, angle=-12):
    p = clamp((t - start) / 0.25)
    if p <= 0:
        return
    scale = 1.6 - 0.6 * ease(p)
    f = ANTON(int(size * scale))
    tw = int(ImageDraw.Draw(img).textlength(text, font=f)) + 60
    th = int(size * scale * 1.5)
    layer = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    a = int(230 * ease(p))
    ld.rectangle([4, 4, tw - 5, th - 5], outline=col + (a,), width=max(4, int(7 * scale)))
    ld.text((tw // 2, th // 2), text, font=f, fill=col + (a,), anchor="mm")
    layer = layer.rotate(angle, expand=True, resample=Image.BICUBIC)
    img.paste(layer, (xy[0] - layer.width // 2, xy[1] - layer.height // 2), layer)


def dossier(d, t, rows, title_t):
    # case-file card
    p = prog(t, title_t, 0.6)
    x, y, w, h = 260, 170, 1400, 740
    d.rounded_rectangle([x, y, x + w, y + h], 18, fill=blend((231, 223, 204), p), outline=blend((160, 150, 130), p), width=3)
    d.rectangle([x, y, x + w, y + 90], fill=blend((40, 40, 56), p))
    text_center(d, (x + 40, y + 45), "SUBJECT FILE", MONO(30), (220, 220, 230), p, anchor="lm")
    text_center(d, (x + w - 40, y + 45), "EP. 01", MONO(30), GOLD, p, anchor="rm")
    for i, (st, k, v) in enumerate(rows):
        q = prog(t, st, 0.4)
        yy = y + 170 + i * 105
        if q > 0:
            d.text((x + 70, yy), k, font=MONO(36), fill=blend((90, 84, 70), q), anchor="lm")
            n = int(clamp((t - st) / 0.6) * len(v))
            d.text((x + 470, yy), v[:n], font=MONO(46), fill=(25, 25, 30), anchor="lm")
            d.line([x + 70, yy + 42, x + w - 70, yy + 42], fill=(200, 190, 170), width=2)


def s_origins(img, d, t):
    # 19.8 – 32.0: who she really was
    rows = [(20.1, "REAL NAME", "ANNA SOROKIN"), (22.3, "BORN", "RUSSIA, 1991"),
            (24.6, "RAISED", "SMALL TOWN, GERMANY"), (26.8, "FATHER", "TRUCK DRIVER"),
            (28.7, "TRUST FUND", ""), (30.2, "FAMILY FORTUNE", "")]
    dossier(d, t, rows, 19.9)
    stamp(img, t, 28.8, "NONE", (1080, 170 + 170 + 4 * 105), size=58)
    stamp(img, t, 30.3, "NONE", (1180, 170 + 170 + 5 * 105), size=58, angle=8)


def s_paris(img, d, t):
    # 32.0 – 38.0: Paris internship + new name
    p = prog(t, 32.1, 0.6)
    text_center(d, (W // 2, 250), "PARIS", ANTON(150), INK, p)
    text_center(d, (W // 2, 360), "INTERNSHIP  ·  FASHION MAGAZINE", MONO(40), GOLD, prog(t, 33.0, 0.5))
    q = prog(t, 35.6, 0.4)
    text_center(d, (W // 2, 560), "A NEW NAME:", MONO(36), MUTED, q)
    f = ANTON(140)
    text_center(d, (W // 2, 700), "ANNA SOROKIN", f, INK, q)
    s = clamp((t - 36.6) / 0.6)
    if s > 0:  # strike-through
        wdt = d.textlength("ANNA SOROKIN", font=f)
        x0 = W // 2 - wdt / 2
        d.line([x0 - 10, 705, x0 - 10 + (wdt + 20) * s, 705], fill=RED, width=14)


def skyline(d, t, seed=7):
    rnd = random.Random(seed)
    shift = (t - 38) * 18
    x = -200 - shift
    while x < W + 200:
        bw = rnd.randint(70, 170)
        bh = rnd.randint(180, 620)
        top = H - bh
        d.rectangle([x, top, x + bw, H], fill=(22, 24, 40))
        for wy in range(top + 20, H - 20, 34):
            for wx in range(int(x) + 14, int(x + bw) - 14, 26):
                if rnd.random() < 0.35:
                    d.rectangle([wx, wy, wx + 10, wy + 16], fill=(242, 190, 90) if rnd.random() < .8 else (160, 190, 255))
        x += bw + rnd.randint(4, 20)


def s_newyork(img, d, t):
    # 38.0 – 45.6: New York, the €60M claim
    # dusk gradient
    for i in range(0, H, 8):
        k = i / H
        col = (int(60 + 120 * k), int(30 + 50 * k), int(70 + 10 * k))
        d.rectangle([0, i, W, i + 8], fill=col)
    skyline(d, t)
    p = prog(t, 38.0, 0.6)
    text_center(d, (W // 2, 170), "ANNA DELVEY", ANTON(130), INK, p)
    text_center(d, (W // 2, 270), "NEW YORK  ·  2014", MONO(40), GOLD, prog(t, 39.2, 0.5))
    q = clamp((t - 42.0) / 2.6)
    if t > 41.6:
        text_center(d, (W // 2, 400), "\"GERMAN HEIRESS\" — CLAIMED TRUST FUND", MONO(34), INK, prog(t, 41.6, 0.4))
        val = int(60_000_000 * ease(q))
        d.text((W // 2, 520), f"€{val:,}", font=ANTON(150), fill=GOLD, anchor="mm", stroke_width=6, stroke_fill=BG)


def s_nobody(img, d, t):
    # 45.6 – end: punchline
    a = prog(t, 45.8, 0.4)
    text_center(d, (W // 2, 470), "AND HERE'S THE THING —", MONO(44), MUTED, a)
    b = prog(t, 46.9, 0.25)
    text_center(d, (W // 2, 600), "NOBODY CHECKED.", ANTON(170), INK, b)
    if b > 0:
        wdt = d.textlength("NOBODY CHECKED.", font=ANTON(170)) * b
        d.rectangle([W // 2 - wdt / 2, 700, W // 2 + wdt / 2, 714], fill=RED)


SCENES = [(0.0, 8.4, s_disclaimer), (8.4, 12.0, s_sentence), (12.0, 19.8, s_agenda),
          (19.8, 32.0, s_origins), (32.0, 38.0, s_paris), (38.0, 45.6, s_newyork), (45.6, 99, s_nobody)]


# ---------- post: camera drift, grain, vignette, scene fades ----------

def make_vignette():
    yy, xx = np.mgrid[0:H, 0:W]
    r = np.sqrt(((xx - W / 2) / (W / 2)) ** 2 + ((yy - H / 2) / (H / 2)) ** 2)
    return np.clip(1.15 - 0.55 * r ** 2, 0.35, 1.0)[..., None].astype(np.float32)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("vo")
    ap.add_argument("out")
    ap.add_argument("--fps", type=int, default=24)
    ap.add_argument("--grain", action="store_true", help="add film grain (much larger file)")
    ap.add_argument("--preview", type=float, default=None, help="render a single frame at this time to out (png)")
    a = ap.parse_args()

    vig = make_vignette()
    rng = np.random.default_rng(1)
    grains = [rng.normal(0, 4, (H, W, 1)).astype(np.float32) for _ in range(6)]

    def frame(t):
        img = Image.new("RGB", (W, H), BG)
        d = ImageDraw.Draw(img)
        for st, en, fn in SCENES:
            if st <= t < en:
                fn(img, d, t)
                # slow push-in on every scene, so nothing is static
                z = 1 + 0.035 * clamp((t - st) / max(en - st, 1))
                if z > 1:
                    cw, ch = int(W / z), int(H / z)
                    img = img.crop(((W - cw) // 2, (H - ch) // 2, (W + cw) // 2, (H + ch) // 2)).resize((W, H), Image.BICUBIC)
                fade = min(clamp((t - st) / 0.25), clamp((en - t) / 0.25))
                break
        arr = np.asarray(img, dtype=np.float32) * vig * fade
        if a.grain:
            arr += grains[int(t * a.fps // 3) % len(grains)]
        return np.clip(arr, 0, 255).astype(np.uint8)

    if a.preview is not None:
        Image.fromarray(frame(a.preview)).save(a.out)
        return

    n = int(DURATION * a.fps)
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
           "-r", str(a.fps), "-i", "-", "-i", a.vo,
           # low cinematic drone under the VO
           "-f", "lavfi", "-i", f"sine=frequency=55:duration={DURATION},volume=0.05",
           "-filter_complex", "[2:a]tremolo=f=0.15:d=0.6,lowpass=f=200[bed];[1:a][bed]amix=inputs=2:duration=first:normalize=0[aout]",
           "-map", "0:v", "-map", "[aout]", "-c:v", "libx264", "-preset", "slow", "-crf", "20",
           "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-shortest", a.out]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for i in range(n):
        p.stdin.write(frame(i / a.fps).tobytes())
    p.stdin.close()
    p.wait()


if __name__ == "__main__":
    main()
