"""Render minutes 2-4 of episode 01 in the same motion-graphics style as minute 1.

Usage: python3 render_minutes.py <minute 2|3|4> [--preview SECONDS out.png]
Reads minuteNN/MNN_VO01_NARRATION_orion-voice.mp3, writes minuteNN/MNN_MOTION_minuteNN_orion.mp4.
Cue times come from pause detection on each VO file.
"""
import argparse, math, os, subprocess, sys
import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "minute01", "motion"))
from render_m01 import (W, H, BG, INK, MUTED, RED, GOLD, GREEN, ANTON, POP, POPB, MONO,  # noqa: E402
                        clamp, ease, prog, text_center, blend, stamp, make_vignette)

PAPER = (231, 223, 204)
CARD = (24, 24, 38)


def card(d, box, col, p, fill=CARD, r=24, width=4):
    d.rounded_rectangle(box, r, fill=blend(fill, p), outline=blend(col, p), width=width)


def icon(d, kind, cx, cy, col, p, r=46):
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=blend(col, p))
    mk = BG
    if kind == "check":
        d.line([cx - 22, cy + 2, cx - 6, cy + 18, cx + 24, cy - 18], fill=mk, width=10, joint="curve")
    elif kind == "cross":
        d.line([cx - 18, cy - 18, cx + 18, cy + 18], fill=mk, width=10)
        d.line([cx - 18, cy + 18, cx + 18, cy - 18], fill=mk, width=10)
    else:
        d.rectangle([cx - 5, cy - 26, cx + 5, cy + 8], fill=mk)
        d.ellipse([cx - 7, cy + 15, cx + 7, cy + 29], fill=mk)


def doc(d, x, y, w, h, p, title):
    d.rectangle([x, y, x + w, y + h], fill=blend(PAPER, p), outline=blend((160, 150, 130), p), width=3)
    text_center(d, (x + 40, y + 50), title, MONO(30), (60, 56, 48), p, anchor="lm")
    for i in range(7):
        yy = y + 120 + i * 52
        d.rectangle([x + 40, yy, x + 40 + (w - 80) * (0.55 + 0.4 * ((i * 37) % 10) / 10), yy + 14], fill=blend((190, 180, 160), p))
    text_center(d, (x + w - 30, y + h - 30), "RECONSTRUCTION", MONO(22), (150, 140, 120), p, anchor="rs")


# ------------------------------- MINUTE 2 -------------------------------

def m2_playbook(img, d, t):
    text_center(d, (W // 2, 150), "THE PLAYBOOK", ANTON(110), INK, prog(t, 0.0, 0.5))
    p1 = prog(t, 0.4, 0.5)
    card(d, [180, 290, 900, 860], GREEN, p1)
    text_center(d, (540, 370), "STEP 01", MONO(36), GREEN, p1)
    text_center(d, (540, 470), "LOOK RICH", ANTON(96), INK, p1)
    text_center(d, (540, 560), "Boutique hotels · huge tabs", POP(34), MUTED, prog(t, 1.3, 0.5))
    # $100 bills fluttering down
    for i in range(9):
        s = t - 3.0 - i * 0.25
        if s > 0 and t < 14.9:
            yy = 610 + (s * 160) % 230
            xx = 260 + i * 68 + 14 * math.sin(s * 3 + i)
            d.rounded_rectangle([xx, yy, xx + 58, yy + 30], 4, fill=(60, 140, 80), outline=(150, 220, 160), width=2)
            d.text((xx + 29, yy + 15), "$100", font=MONO(14), fill=(220, 255, 220), anchor="mm")
    p2 = prog(t, 6.6, 0.5)
    card(d, [1020, 290, 1740, 860], GOLD, p2)
    text_center(d, (1380, 370), "STEP 02", MONO(36), GOLD, p2)
    text_center(d, (1380, 470), "THE MONEY IS", ANTON(80), INK, p2)
    text_center(d, (1380, 555), "ALWAYS \"STUCK\"", ANTON(80), GOLD, p2)
    if p2 > 0:  # phone notification with spinner
        q = prog(t, 8.0, 0.5)
        d.rounded_rectangle([1130, 640, 1630, 780], 22, fill=blend((40, 40, 60), q), outline=blend((90, 90, 120), q), width=2)
        text_center(d, (1200, 685), "Wire transfer pending", POPB(30), INK, q, anchor="lm")
        text_center(d, (1200, 735), "From: Europe  ·  ETA: soon", POP(26), MUTED, q, anchor="lm")
        ang = t * 360 % 360
        d.arc([1160, 662, 1186, 688], ang, ang + 270, fill=blend(GOLD, q), width=4)


def m2_foundation(img, d, t):
    text_center(d, (W // 2, 140), "STEP 03 — THE BIG ONE", MONO(40), RED, prog(t, 14.8, 0.5))
    p = prog(t, 17.5, 0.6)
    # landmark building
    bx, by = 260, 300
    d.rectangle([bx, by + 80, bx + 600, by + 560], fill=blend((44, 44, 64), p))
    d.polygon([(bx - 20, by + 80), (bx + 300, by - 20), (bx + 620, by + 80)], fill=blend((60, 60, 84), p))
    for i in range(6):
        cx = bx + 50 + i * 100
        d.rectangle([cx, by + 130, cx + 36, by + 520], fill=blend((120, 120, 150), p))
    text_center(d, (bx + 300, by + 610), "PARK AVENUE SOUTH", MONO(28), MUTED, p)
    if t >= 26.6:
        doc(d, 1000, 300, 600, 560, prog(t, 26.6, 0.5), "BANK STATEMENT")
        stamp(img, t, 30.3, "FAKE", (1300, 600), size=110)
        return
    text_center(d, (1290, 330), "THE ANNA DELVEY", ANTON(84), INK, p)
    text_center(d, (1290, 420), "FOUNDATION", ANTON(84), GOLD, p)
    text_center(d, (1290, 500), "a private arts club", POP(36), MUTED, prog(t, 18.6, 0.5))
    q = prog(t, 23.3, 0.4)
    if q > 0:
        text_center(d, (1290, 600), "LOAN SOUGHT", MONO(30), MUTED, q)
        d.text((1290, 700), "$22,000,000", font=ANTON(130), fill=blend(INK, q), anchor="mm")


def m2_loop(img, d, t):
    text_center(d, (W // 2, 130), "THE $100,000 LOOP", ANTON(90), INK, prog(t, 31.6, 0.5))
    # nodes
    nodes = {"ANNA": (W // 2, 760), "LENDER": (1440, 400), "BANK": (480, 400)}
    pa = prog(t, 31.7, 0.5)
    for k, (x, y) in nodes.items():
        col = GOLD if k == "ANNA" else INK
        pp = pa if k != "BANK" else prog(t, 35.5, 0.5)
        card(d, [x - 190, y - 70, x + 190, y + 70], col, pp)
        text_center(d, (x, y), {"ANNA": "ANNA", "LENDER": "THE LENDER", "BANK": "A DIFFERENT BANK"}[k], ANTON(48), col, pp)
    text_center(d, (1440, 300), "wants $100,000 to review her application", POP(28), MUTED, prog(t, 32.4, 0.5))

    def arrow(a, b, s, col, label, lxy):
        if s <= 0:
            return
        (x1, y1), (x2, y2) = a, b
        xe, ye = x1 + (x2 - x1) * s, y1 + (y2 - y1) * s
        d.line([x1, y1, xe, ye], fill=col, width=8)
        ang = math.atan2(ye - y1, xe - x1)
        d.polygon([(xe, ye), (xe - 26 * math.cos(ang - .4), ye - 26 * math.sin(ang - .4)),
                   (xe - 26 * math.cos(ang + .4), ye - 26 * math.sin(ang + .4))], fill=col)
        if s > .8:
            d.text(lxy, label, font=ANTON(44), fill=col, anchor="mm")

    arrow((560, 470), (W // 2 - 120, 690), prog(t, 36.5, 0.8), GREEN, "$100K LOAN", (560, 640))
    arrow((W // 2 + 120, 690), (1360, 470), prog(t, 38.0, 0.8), GREEN, "$100K FEE", (1360, 640))
    if t > 41.1:
        text_center(d, (W // 2, 900), "\"Can we verify your money in Europe?\"", POPB(36), GOLD, prog(t, 41.1, 0.5))
        text_center(d, (W // 2, 970), "ANNA WALKS AWAY", MONO(36), RED, prog(t, 42.6, 0.5))
    if t > 45.4:
        text_center(d, (480, 300), "wants its $100,000 back", POPB(32), RED, prog(t, 45.4, 0.5))
        stamp(img, t, 47.6, "GONE", (480, 520), size=90)


def m2_jet(img, d, t):
    text_center(d, (W // 2, 120), "MEANWHILE…", MONO(40), MUTED, prog(t, 48.4, 0.5))
    a, b = (360, 640), (1560, 560)
    p = prog(t, 49.0, 0.5)
    for (x, y), name in ((a, "NEW YORK"), (b, "OMAHA, NEBRASKA")):
        d.ellipse([x - 16, y - 16, x + 16, y + 16], fill=blend(GOLD, p))
        text_center(d, (x, y + 60), name, MONO(32), INK, p)
    s = clamp((t - 51.5) / 3.5)
    pts = []
    for i in range(41):
        u = i / 40 * s
        x = a[0] + (b[0] - a[0]) * u
        y = a[1] + (b[1] - a[1]) * u - 300 * math.sin(math.pi * u)
        pts.append((x, y))
    if s > 0:
        for i in range(0, len(pts) - 1, 2):
            d.line([pts[i], pts[i + 1]], fill=INK, width=6)
        (x, y), (px, py) = pts[-1], pts[-2]
        ang = math.atan2(y - py, x - px)
        tri = [(x + 34 * math.cos(ang), y + 34 * math.sin(ang)),
               (x + 22 * math.cos(ang + 2.5), y + 22 * math.sin(ang + 2.5)),
               (x + 22 * math.cos(ang - 2.5), y + 22 * math.sin(ang - 2.5))]
        d.polygon(tri, fill=GOLD)
    text_center(d, (W // 2, 220), "PRIVATE JET TO WARREN BUFFETT'S SHAREHOLDER MEETING", POPB(36), INK, prog(t, 52.0, 0.5))
    q = prog(t, 56.0, 0.4)
    if q > 0:
        d.rectangle([700, 700, 1220, 940], fill=blend(PAPER, q))
        text_center(d, (730, 740), "CHARTER INVOICE", MONO(28), (60, 56, 48), q, anchor="lm")
        d.text((960, 830), "$35,000", font=ANTON(96), fill=blend((25, 25, 30), q), anchor="mm")
        stamp(img, t, 57.6, "UNPAID", (1140, 760), size=60)
    text_center(d, (W // 2, 1000), "LATER: ONE OF THE CHARGES SHE WAS CONVICTED ON", MONO(30), RED, prog(t, 58.7, 0.5))


def m2_pattern(img, d, t):
    text_center(d, (W // 2, 260), "THE PATTERN", MONO(40), MUTED, prog(t, 63.3, 0.5))
    text_center(d, (W // 2, 400), "ACT LIKE THE MONEY IS REAL.", ANTON(100), INK, prog(t, 63.6, 0.5))
    text_center(d, (W // 2, 520), "LET POLITENESS DO THE REST.", ANTON(100), GOLD, prog(t, 66.4, 0.5))
    q = prog(t, 69.9, 0.4)
    text_center(d, (W // 2, 720), "NOBODY WANTS TO ASK AN HEIRESS", ANTON(78), INK, q)
    text_center(d, (W // 2, 810), "FOR PROOF.", ANTON(78), RED, q)


M2 = [(0.0, 14.8, m2_playbook), (14.8, 31.6, m2_foundation), (31.6, 48.4, m2_loop),
      (48.4, 63.2, m2_jet), (63.2, 99, m2_pattern)]


# ------------------------------- MINUTE 3 -------------------------------

def warm_bg(d):
    for i in range(0, H, 8):
        k = i / H
        d.rectangle([0, i, W, i + 8], fill=(int(120 + 80 * k), int(50 + 40 * k), int(30 + 10 * k)))


def m3_trip(img, d, t):
    warm_bg(d)
    d.ellipse([1600, 420, 1840, 660], fill=(255, 196, 110))
    for i in range(7):  # arches skyline
        x = 40 + i * 270
        d.rectangle([x, 700, x + 240, H], fill=(70, 30, 25))
        d.pieslice([x + 40, 620, x + 200, 780], 180, 360, fill=(70, 30, 25))
        d.rectangle([x + 80, 760, x + 160, H], fill=(40, 16, 14))
    text_center(d, (W // 2, 230), "MARRAKECH, MOROCCO", ANTON(120), INK, prog(t, 0.4, 0.6))
    text_center(d, (W // 2, 340), "2017  ·  A LUXURY TRIP", MONO(40), (255, 220, 160), prog(t, 1.4, 0.5))
    q = prog(t, 4.4, 0.5)
    if q > 0:
        d.rounded_rectangle([560, 430, 1360, 590], 20, fill=tuple(int(c * q + w * (1 - q)) for c, w in zip((30, 20, 24), (150, 70, 45))))
    text_center(d, (W // 2, 485), "RACHEL DeLOACHE WILLIAMS", ANTON(56), INK, q)
    text_center(d, (W // 2, 550), "Photo editor, Vanity Fair", POP(32), (255, 220, 160), q)


def m3_bill(img, d, t):
    p = prog(t, 8.7, 0.5)
    # declined card
    d.rounded_rectangle([200, 300, 800, 660], 30, fill=blend((30, 30, 46), p), outline=blend((90, 90, 120), p), width=3)
    d.rectangle([260, 340, 350, 400], fill=blend(GOLD, p))
    text_center(d, (260, 560), "ANNA'S CARD", MONO(30), MUTED, p, anchor="lm")
    if t > 9.2 and int((t - 9.2) * 3) % 2 == 0 and t < 10.8:
        text_center(d, (500, 470), "DECLINED", ANTON(90), RED, 1)
    elif t >= 10.8:
        text_center(d, (500, 470), "DECLINED", ANTON(90), RED, 1)
    text_center(d, (1340, 230), "PAID ON RACHEL'S CARDS", MONO(36), INK, prog(t, 10.7, 0.5))
    items = [(11.4, "VILLA"), (12.4, "MEALS"), (13.3, "PRIVATE TRAINER")]
    for i, (st, s) in enumerate(items):
        q = prog(t, st, 0.4)
        y = 330 + i * 90
        text_center(d, (1060, y), s, POPB(40), INK, q, anchor="lm")
        if q > 0:
            d.line([1060, y + 40, 1620, y + 40], fill=blend((80, 80, 100), q), width=2)
    v = int(62000 * ease((t - 13.6) / 1.2)) if t > 13.6 else 0
    if t > 13.6:
        d.text((1340, 700), f"≈ ${v:,}", font=ANTON(120), fill=GOLD, anchor="mm")
    text_center(d, (1340, 820), "MORE THAN RACHEL MADE IN A YEAR", MONO(32), RED, prog(t, 14.9, 0.5))


def m3_after(img, d, t):
    text_center(d, (W // 2, 230), "ANNA PROMISED TO PAY HER BACK.", ANTON(90), INK, prog(t, 16.7, 0.5))
    stamp(img, t, 19.35, "SHE DIDN'T", (W // 2, 360), size=80, angle=-6)
    for i, (st, a, b) in enumerate([(19.9, "VANITY FAIR", "her first-person story"), (23.8, "MY FRIEND ANNA", "then a whole book")]):
        q = prog(t, st, 0.5)
        x = 460 + i * 1000
        card(d, [x - 330, 520, x + 330, 820], GOLD, q)
        text_center(d, (x, 640), a, ANTON(68), INK, q)
        text_center(d, (x, 730), b, POP(34), MUTED, q)


def m3_twist(img, d, t):
    text_center(d, (W // 2, 330), "AND THE TWIST?", MONO(48), MUTED, prog(t, 26.7, 0.4))
    text_center(d, (W // 2, 460), "ON THE CHARGE INVOLVING RACHEL, THE JURY SAID:", POPB(40), INK, prog(t, 27.9, 0.5))
    q = prog(t, 29.0, 0.3)
    text_center(d, (W // 2, 640), "NOT GUILTY", ANTON(210), GOLD, q)


M3 = [(0.0, 8.7, m3_trip), (8.7, 16.6, m3_bill), (16.6, 26.6, m3_after), (26.6, 99, m3_twist)]


# ------------------------------- MINUTE 4 -------------------------------

ROWS = [  # (start, verdict_t, sub_t, claim, verdict, kind, colour, sub)
    (4.1, 8.6, 9.6, "The heiress con · hotels · $22M loan · the foundation", "REAL", "check", GREEN, "That's court record."),
    (11.8, 14.7, 15.0, "Vivian Kent, the journalist chasing the story", "INVENTED", "cross", RED, "Stand-in for Jessica Pressler (New York magazine, 2018)"),
    (21.8, 22.4, 23.2, "Rachel's portrayal", "DISPUTED", "bang", GOLD, "Rachel sued Netflix for defamation in 2022"),
    (29.3, 31.5, 33.0, "Neff, the hotel concierge", "REAL", "check", GREEN, "Neff Davis — a real friend, drama turned up"),
    (42.3, 43.6, 46.3, "The courtroom outfits", "REAL", "check", GREEN, "She had a stylist choosing her trial looks"),
    (49.2, 51.0, 53.8, "Netflix paid Anna for her story", "REPORTED", "check", GREEN, "≈ $320,000 — much of it went to paying people back"),
]


def m4_score(img, d, t):
    text_center(d, (W // 2, 90), "NETFLIX  vs  REALITY", ANTON(84), INK, prog(t, 0.0, 0.5))
    text_center(d, (W // 2, 160), "LET'S SCORE IT", MONO(32), GOLD, prog(t, 2.7, 0.5))
    for i, (st, vt, sbt, claim, verdict, kind, col, sub) in enumerate(ROWS):
        p = prog(t, st, 0.5)
        if p <= 0:
            continue
        y = 200 + i * 132
        on = prog(t, vt, 0.3)
        edge = col if on > 0 else (70, 70, 90)
        card(d, [140, y, 1780, y + 118], edge, p, r=18, width=3)
        text_center(d, (190, y + 42), claim, POPB(36), INK, p, anchor="lm")
        text_center(d, (190, y + 88), sub, POP(26), MUTED, prog(t, sbt, 0.4), anchor="lm")
        if on > 0:
            icon(d, kind, 1430, y + 59, col, on, r=34)
            text_center(d, (1490, y + 59), verdict, ANTON(52), col, on, anchor="lm")
    if t > 56.6:
        q = prog(t, 56.6, 0.4)
        text_center(d, (W // 2, 1028), "SCORE:  4 REAL  ·  1 INVENTED  ·  1 DISPUTED", MONO(30), GOLD, q)


M4 = [(0.0, 99, m4_score)]

MINUTES = {2: M2, 3: M3, 4: M4}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("minute", type=int, choices=sorted(MINUTES))
    ap.add_argument("--fps", type=int, default=24)
    ap.add_argument("--preview", nargs=2, metavar=("SECONDS", "OUT"))
    a = ap.parse_args()
    nn = f"{a.minute:02d}"
    vo = os.path.join(HERE, f"minute{nn}", f"M{nn}_VO01_NARRATION_orion-voice.mp3")
    out = os.path.join(HERE, f"minute{nn}", f"M{nn}_MOTION_minute{nn}_orion.mp4")
    dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", vo],
                               capture_output=True, text=True).stdout) + 0.4
    scenes = MINUTES[a.minute]
    vig = make_vignette()

    def frame(t):
        img = Image.new("RGB", (W, H), BG)
        d = ImageDraw.Draw(img)
        fade = 1.0
        for i, (st, en, fn) in enumerate(scenes):
            if st <= t < en:
                fn(img, d, t)
                end = min(en, dur)
                z = 1 + 0.035 * clamp((t - st) / max(end - st, 1))
                cw, ch = int(W / z), int(H / z)
                img = img.crop(((W - cw) // 2, (H - ch) // 2, (W + cw) // 2, (H + ch) // 2)).resize((W, H), Image.BICUBIC)
                fade = min(clamp((t - st) / 0.25) if i else 1.0, clamp((end - t) / 0.25))
                break
        return np.clip(np.asarray(img, dtype=np.float32) * vig * fade, 0, 255).astype(np.uint8)

    if a.preview:
        Image.fromarray(frame(float(a.preview[0]))).save(a.preview[1])
        return

    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
           "-r", str(a.fps), "-i", "-", "-i", vo,
           "-f", "lavfi", "-i", f"sine=frequency=55:duration={dur},volume=0.05",
           "-filter_complex", "[2:a]tremolo=f=0.15:d=0.6,lowpass=f=200[bed];[1:a][bed]amix=inputs=2:duration=first:normalize=0[aout]",
           "-map", "0:v", "-map", "[aout]", "-c:v", "libx264", "-preset", "slow", "-crf", "20",
           "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-shortest", out]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    try:
        for i in range(int(dur * a.fps)):
            p.stdin.write(frame(i / a.fps).tobytes())
        p.stdin.close()
    except BrokenPipeError:  # ffmpeg stops at the end of the VO (-shortest)
        pass
    p.wait()


if __name__ == "__main__":
    main()
