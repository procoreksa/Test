"""Render the Pro Core branded PDF report (Arabic, black & gold) from output/compounds_master.json."""
import html
import json
import pathlib
import subprocess
from collections import Counter

ROOT = pathlib.Path(__file__).parent
OUT = ROOT / "output"
R = json.load(open(OUT / "compounds_master.json"))
N = len(R)
e = html.escape

TYPE_AR = {
    "Villa Compound": "مجمع فلل", "Mixed Residential Compound": "مجمع مختلط", "Apartment Compound": "مجمع شقق",
    "Luxury Residential Compound": "مجمع فاخر", "Family Compound": "مجمع عائلي", "Staff Accommodation": "سكن موظفين",
    "Corporate Housing": "سكن مؤسسي", "Mid-Market Residential Compound": "مجمع متوسط",
}
MGMT_AR = {"Owner Managed": "إدارة المالك", "Third-Party Property Management": "إدارة طرف ثالث",
           "Developer Managed": "إدارة المطور", "Unknown": "غير معروف"}
VER_AR = {"Verified": "موثق", "Cross-Checked": "متقاطع", "Unverified": "غير مؤكد", "Outdated": "قديم", "Not Available": "غير متاح"}
OPP_AR = {"Property management": "إدارة عقارات", "Marketing & leasing": "تسويق وتأجير", "Social media management": "سوشيال ميديا",
          "Content & photography": "محتوى وتصوير", "Paid ad campaigns": "حملات إعلانية", "Integrated services": "خدمات متكاملة"}


def verif(r):
    v = [x["verification"] for x in r["contacts"]]
    for lvl in ("Verified", "Cross-Checked", "Unverified", "Outdated"):
        if lvl in v:
            return lvl
    return "Not Available"


def has(r, word, neg=False):
    return any((word in x["kind"]) != neg for x in r["contacts"])


phones = sum(1 for r in R if has(r, "Email", neg=True))
mails = sum(1 for r in R if has(r, "Email"))
wa = sum(1 for r in R if has(r, "WhatsApp"))
ver = Counter(verif(r) for r in R)
types = Counter(r["type"] for r in R)
mg = Counter(r["mgmt"] for r in R)
pr = Counter("A" if r["total"] >= 80 else "B" if r["total"] >= 60 else "C" for r in R)
pct = lambda n: f"{round(100 * n / N)}%"
ranked = sorted(R, key=lambda r: (-r["total"], r["name_en"]))


def bars(items, total, unit=""):
    mx = max(v for _, v in items) or 1
    rows = "".join(
        f'<div class="bar"><span class="bl">{e(k)}</span><span class="bt"><i style="width:{100 * v / mx:.0f}%"></i></span>'
        f'<span class="bv">{v}{unit}</span></div>' for k, v in items)
    return f'<div class="bars">{rows}</div>'


def best_contact(r):
    for x in r["contacts"]:
        if x["verification"] in ("Verified", "Cross-Checked"):
            return x["value"]
    return r["contacts"][0]["value"] if r["contacts"] else "—"


# schematic location map from coordinates (core Khobar extent; far-out points listed separately)
allpts = [r for r in R if r["lat"]]
pts = [r for r in allpts if 26.15 <= float(r["lat"]) <= 26.42 and 50.05 <= float(r["lng"]) <= 50.26]
far = [r for r in allpts if r not in pts]
la = [float(r["lat"]) for r in pts]
lo = [float(r["lng"]) for r in pts]
x0, x1, y0, y1 = min(lo) - 0.005, max(lo) + 0.005, min(la) - 0.005, max(la) + 0.005
P = 24
W = 560
H = int(W * (y1 - y0) / (x1 - x0) * 1.1) + 2 * P
sx = lambda v: P + (float(v) - x0) / (x1 - x0) * (W - 2 * P)
sy = lambda v: H - P - (float(v) - y0) / (y1 - y0) * (H - 2 * P)
rank = {r["id"]: i for i, r in enumerate(ranked[:20], 1)}
grid = "".join(f'<line x1="{P}" x2="{W - P}" y1="{sy(y0 + k * (y1 - y0) / 6):.1f}" y2="{sy(y0 + k * (y1 - y0) / 6):.1f}" stroke="#e8e0c8"/>' for k in range(1, 6))
dots = "".join(f'<circle cx="{sx(r["lng"]):.1f}" cy="{sy(r["lat"]):.1f}" r="3.2" fill="#9a9a9a"/>' for r in pts if r["id"] not in rank)
marks = "".join(
    f'<g><circle cx="{sx(r["lng"]):.1f}" cy="{sy(r["lat"]):.1f}" r="8.5" fill="#111" stroke="#C9A227" stroke-width="1.6"/>'
    f'<text x="{sx(r["lng"]):.1f}" y="{sy(r["lat"]) + 3.2:.1f}" text-anchor="middle" font-size="8.5" font-weight="700" fill="#C9A227">{rank[r["id"]]}</text></g>'
    for r in sorted(pts, key=lambda r: -rank.get(r["id"], 0)) if r["id"] in rank)
svgmap = (f'<svg viewBox="0 0 {W} {H}" class="map"><rect x="0" y="0" width="{W}" height="{H}" fill="#faf7ee" stroke="#C9A227"/>{grid}'
          f'<text x="{W - 12}" y="22" text-anchor="end" font-size="12" fill="#111" font-weight="700">↑ الشمال</text>{dots}{marks}</svg>')
onmap = {r["id"] for r in pts}
legend = "".join(
    f'<li><span class="num{"" if r["id"] in onmap else " off"}">{i}</span><span class="en">{e(r["name_en"])}</span>'
    f'{"" if r["id"] in onmap else ("<span class=offt>خارج الخريطة</span>" if r["lat"] else "<span class=offt>بلا إحداثيات</span>")}</li>'
    for i, r in enumerate(ranked[:20], 1))
far_txt = "، ".join(e(r["name_en"]) for r in far)

top_rows = "".join(
    f'<tr><td>{i}</td><td class="en">{e(r["name_en"])}</td><td>{e(r["district"] or "—")}</td>'
    f'<td>{TYPE_AR.get(r["type"], r["type"])}</td><td>{r["units"] or "—"}</td><td class="sc">{r["total"]}</td>'
    f'<td class="en">{e(best_contact(r))}</td><td>{VER_AR[verif(r)]}</td>'
    f'<td>{"، ".join(OPP_AR.get(o, o) for o in r["opps"][:2])}</td></tr>'
    for i, r in enumerate(ranked[:20], 1))

operators = {}
for r in R:
    who = r["manager"] or r["owner"] or r["developer"]
    if who:
        operators.setdefault(who, []).append(r["name_en"])
op_rows = "".join(
    f'<tr><td class="en">{e(k)}</td><td>{len(v)}</td><td class="en small">{e(", ".join(v))}</td></tr>'
    for k, v in sorted(operators.items(), key=lambda t: (-len(t[1]), t[0])))

all_rows = "".join(
    f'<tr><td>{e(r["id"])}</td><td class="en">{e(r["name_en"])}{"<br><span class=ar>" + e(r["name_ar"]) + "</span>" if r["name_ar"] else ""}</td>'
    f'<td>{e(r["district"] or "—")}</td><td>{TYPE_AR.get(r["type"], r["type"])}</td><td>{r["units"] or "—"}</td>'
    f'<td class="en small">{"<br>".join(e(x["value"]) for x in r["contacts"][:3]) or "—"}</td>'
    f'<td>{VER_AR[verif(r)]}</td><td class="en small">{e(r["manager"] or r["owner"] or r["developer"] or "—")}</td>'
    f'<td class="sc">{r["total"]}</td></tr>' for r in sorted(R, key=lambda r: r["id"]))

srcs = Counter(s for r in R for s in r["sources"])
src_rows = "".join(f'<tr><td class="en small"><a href="{e(u)}">{e(u[:110])}</a></td><td>{n}</td></tr>'
                   for u, n in srcs.most_common())

gaps = [r for r in ranked if not r["contacts"]]
gap_list = "، ".join(e(r["name_en"]) for r in gaps)

css = """
@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap');
@page { size: A4; margin: 16mm 14mm 18mm 14mm;
  @bottom-center { content: counter(page); } }
* { box-sizing: border-box; }
body { font-family: 'Cairo', 'DejaVu Sans', sans-serif; color: #1a1a1a; font-size: 10.5pt; line-height: 1.6; margin: 0; direction: rtl; }
.en { direction: ltr; unicode-bidi: isolate; text-align: right; }
.small { font-size: 8pt; }
.ar { color: #555; font-size: 8.5pt; }
h1, h2, h3 { margin: 0; }
.page { page-break-after: always; }
.cover { height: 260mm; background: #111; color: #fff; padding: 22mm 16mm; position: relative; margin: 0; border-radius: 4px; }
.brand { color: #C9A227; font-weight: 800; letter-spacing: 6px; font-size: 26pt; direction: ltr; text-align: right; }
.brand small { display: block; font-size: 10pt; letter-spacing: 3px; color: #d9c27a; font-weight: 600; }
.cover .rule { height: 3px; width: 80px; background: #C9A227; margin: 18mm 0 10mm auto; }
.cover h1 { font-size: 30pt; line-height: 1.3; font-weight: 800; }
.cover h1 span { color: #C9A227; }
.cover .sub { font-size: 13pt; color: #ddd; margin-top: 6mm; }
.cover .meta { position: absolute; bottom: 22mm; right: 16mm; left: 16mm; border-top: 1px solid #C9A227; padding-top: 6mm; color: #ccc; font-size: 10pt; display: flex; justify-content: space-between; }
.hdr { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #C9A227; padding-bottom: 3mm; margin-bottom: 6mm; }
.hdr .b { color: #111; font-weight: 800; letter-spacing: 3px; direction: ltr; }
.hdr .b i { color: #C9A227; font-style: normal; }
.hdr .t { color: #777; font-size: 9pt; }
h2 { font-size: 17pt; font-weight: 800; color: #111; margin: 0 0 3mm; }
h2::before { content: ''; display: inline-block; width: 8px; height: 18px; background: #C9A227; margin-left: 8px; vertical-align: -2px; }
h3 { font-size: 12pt; font-weight: 700; margin: 5mm 0 2mm; }
p { margin: 0 0 3mm; }
.lead { font-size: 12pt; font-weight: 600; }
.kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4mm; margin: 5mm 0; }
.kpi { background: #111; color: #fff; padding: 4mm; border-radius: 3px; border-top: 3px solid #C9A227; }
.kpi b { display: block; font-size: 20pt; color: #C9A227; line-height: 1.1; }
.kpi span { font-size: 8.5pt; color: #ddd; }
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; }
.box { border: 1px solid #e3dcc4; background: #fcfaf3; padding: 4mm; border-radius: 3px; }
.bars .bar { display: grid; grid-template-columns: 34mm 1fr 14mm; align-items: center; gap: 2mm; margin: 1.4mm 0; font-size: 9pt; }
.bt { background: #eee; height: 9px; border-radius: 2px; overflow: hidden; }
.bt i { display: block; height: 100%; background: #C9A227; }
.bv { font-weight: 700; direction: ltr; text-align: left; }
table { width: 100%; border-collapse: collapse; font-size: 8pt; }
th { background: #111; color: #C9A227; font-weight: 700; padding: 1.8mm 1.5mm; text-align: right; }
td { border-bottom: 1px solid #e6e1d0; padding: 1.1mm 1.3mm; vertical-align: top; line-height: 1.35; }
tr:nth-child(even) td { background: #faf8f1; }
td.sc { font-weight: 800; color: #111; text-align: center; }
thead { display: table-header-group; }
tr { page-break-inside: avoid; }
ul { margin: 0 0 3mm; padding-right: 5mm; }
li { margin-bottom: 1.2mm; }
.mapwrap { display: grid; grid-template-columns: 1fr 52mm; gap: 5mm; align-items: start; }
.map { width: 100%; max-height: 215mm; }
.legend { list-style: none; padding: 0; margin: 0; font-size: 8pt; }
.num.off { background: #bbb; color: #fff; }
.offt { color: #999; font-size: 7pt; }
.legend li { display: flex; gap: 2mm; align-items: center; margin-bottom: 1.3mm; }
.num { background: #111; color: #C9A227; font-weight: 800; border-radius: 50%; width: 5.5mm; height: 5.5mm; display: inline-flex; align-items: center; justify-content: center; font-size: 7.5pt; flex: none; }
.note { font-size: 8.5pt; color: #666; }
a { color: #7a5f00; text-decoration: none; }
.tag { display: inline-block; background: #C9A227; color: #111; font-weight: 700; padding: 0 2mm; border-radius: 2px; font-size: 8.5pt; }
"""


def hdr(title):
    return f'<div class="hdr"><span class="t">{e(title)}</span><span class="b">PRO <i>CORE</i></span></div>'


doc = f"""<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>Pro Core – قاعدة بيانات المجمعات السكنية</title><style>{css}</style></head><body>

<section class="page cover">
  <div class="brand">PRO CORE<small>PROPERTY MANAGEMENT · MEDIA</small></div>
  <div class="rule"></div>
  <h1>قاعدة بيانات <span>المجمعات السكنية</span><br>وفرص تطوير الأعمال</h1>
  <div class="sub">المنطقة الشرقية – الدفعة الأولى: مدينة الخبر</div>
  <div class="meta"><span>تقرير بحثي داخلي</span><span>تاريخ التحقق: {R[0]["last_checked"]}</span><span>{N} مجمعًا</span></div>
</section>

<section class="page">
{hdr("الملخص التنفيذي")}
<h2>الملخص التنفيذي</h2>
<p class="lead">حصرنا {N} مجمعًا سكنيًا في الخبر، لدى {phones} منها ({pct(phones)}) رقم تواصل منشور، ولدى {mails} ({pct(mails)}) بريد إلكتروني. الفجوة الأكبر هي {len(gaps)} مجمعًا بلا أي وسيلة تواصل منشورة.</p>
<div class="kpis">
  <div class="kpi"><b>{N}</b><span>مجمعًا مكتشفًا</span></div>
  <div class="kpi"><b>{pct(phones)}</b><span>نسبة توفر الهاتف</span></div>
  <div class="kpi"><b>{pct(mails)}</b><span>نسبة توفر البريد</span></div>
  <div class="kpi"><b>{wa}</b><span>أرقام واتساب رسمية</span></div>
</div>
<ul>
  <li><b>الموثوقية:</b> {ver["Verified"] + ver["Cross-Checked"]} مجمعًا ({pct(ver["Verified"] + ver["Cross-Checked"])}) بياناته موثقة من موقع رسمي أو مصدرين مستقلين، و{ver["Unverified"]} غير مؤكدة.</li>
  <li><b>الجهات المشغلة:</b> عرفنا المالك أو المشغل لـ {sum(1 for r in R if r["owner"] or r["manager"] or r["developer"])} مجمعًا، أبرزها Zamil Real Estate وAl Othman Holding وAswad Group وDar Wa Emaar وMazen Al Saeed Group.</li>
  <li><b>الأولويات:</b> {pr["A"]} فرصة بأولوية A، و{pr["B"]} بأولوية B، و{pr["C"]} بأولوية C. لا تُمنح نقاط دون دليل، لذا تبقى المجمعات الكبيرة غير المعروفة بياناتها في الفئة C حتى تُستكمل.</li>
  <li><b>أفضل الفرص الحالية:</b> {"، ".join(e(r["name_en"]) for r in ranked[:5])}.</li>
  <li><b>التوصية:</b> البدء بالمجمعات ذات البيانات الموثقة، والتواصل مع الشركات المشغلة التي تدير أكثر من مجمع، وإجراء تحقق هاتفي مصرح به لاستكمال المجمعات بلا بيانات.</li>
</ul>
<h3>منهجية البحث</h3>
<p>جُمعت البيانات من دليلي المجمعات RightCompound وCompoundIn، ومقالات Property Finder وWhichSchoolAdvisor، ومنتديات المقيمين، ثم المواقع الرسمية للمجمعات والشركات المشغلة. استُخرجت أرقام التواصل آليًا من الصفحات الرسمية، وصُنفت كل وسيلة حسب مصدرها: موثق، متقاطع، غير مؤكد. استُبعدت الفنادق والمكاتب والفلل المفردة، كما استُبعد رقما منصة RightCompound اللذان يظهران في أغلب صفحاتها.</p>
</section>

<section class="page">
{hdr("التوزيع والتحليل")}
<h2>التوزيع والتحليل</h2>
<div class="grid2">
  <div class="box"><h3>حسب نوع المجمع</h3>{bars([(TYPE_AR.get(k, k), v) for k, v in types.most_common()], N)}</div>
  <div class="box"><h3>حسب نوع الإدارة</h3>{bars([(MGMT_AR.get(k, k), v) for k, v in mg.most_common()], N)}</div>
  <div class="box"><h3>توفر بيانات التواصل</h3>{bars([("هاتف", phones), ("بريد إلكتروني", mails), ("واتساب رسمي", wa), ("بلا أي وسيلة", len(gaps))], N)}</div>
  <div class="box"><h3>مستوى موثوقية بيانات التواصل</h3>{bars([(VER_AR[k], ver[k]) for k in ("Verified", "Cross-Checked", "Unverified", "Not Available") if ver[k]], N)}</div>
</div>
<h3>حسب المدينة</h3>
<p>الخبر: {sum(1 for r in R if r["city"] == "Al Khobar")} مجمعًا، وجهة الظهران ضمن الخبر الكبرى: {sum(1 for r in R if r["city"].startswith("Dhahran"))}. الدمام والجبيل في الدفعات القادمة.</p>
<h3>حسب أولوية الفرصة</h3>
{bars([("أولوية A (80+)", pr["A"]), ("أولوية B (60–79)", pr["B"]), ("أولوية C (أقل من 60)", pr["C"])], N)}
</section>

<section class="page">
{hdr("أفضل 20 فرصة تجارية")}
<h2>أفضل 20 فرصة تجارية</h2>
<p>الدرجة من 100: الحجم 20، ملاءمة الخدمات 25، مؤشرات الاحتياج 20، توفر التواصل 15، وضوح جهة التعاقد 10، مؤشرات التعاون 10. هي أولوية بحثية وليست تأكيدًا لرغبة أي جهة في التعاقد.</p>
<table><thead><tr><th>#</th><th>المجمع</th><th>الحي</th><th>النوع</th><th>الوحدات</th><th>الدرجة</th><th>أفضل تواصل</th><th>التحقق</th><th>الفرص</th></tr></thead><tbody>{top_rows}</tbody></table>
</section>

<section class="page">
{hdr("الخريطة الجغرافية")}
<h2>الخريطة الجغرافية للمجمعات</h2>
<p>{len(allpts)} مجمعًا لها إحداثيات. الدوائر المرقمة هي أفضل 20 فرصة، والرمادية بقية المجمعات. الخريطة تخطيطية مرسومة من الإحداثيات، ورابط Google Maps لكل مجمع موجود في ملف Excel.</p>
<div class="mapwrap">{svgmap}<ol class="legend">{legend}</ol></div>
<p class="note">خارج حدود الخريطة: {far_txt}.</p>
</section>

<section class="page">
{hdr("الشركات المالكة والمشغلة")}
<h2>الشركات المالكة والمشغلة المحددة</h2>
<p>التواصل مع شركة تدير عدة مجمعات يفتح أكثر من فرصة بعقد واحد.</p>
<table><thead><tr><th>الشركة</th><th>العدد</th><th>المجمعات</th></tr></thead><tbody>{op_rows}</tbody></table>
<h3>توصيات تطوير الأعمال</h3>
<ul>
  <li><b>Pro Core Property Management:</b> المجمعات الكبيرة ذات الإدارة الذاتية أو غير المعروفة (Eurovillage، The Pearl، Al Danah & Al Nadah، Ronda، Rima)، وعرض خدمات التأجير وإدارة المستأجرين.</li>
  <li><b>Pro Core Media:</b> المجمعات بلا موقع أو حسابات تواصل، والمجمعات الجديدة أو تحت الإنشاء (Dewan Al Jazirah، HY Compound) لإنتاج المحتوى والتصوير والحملات.</li>
  <li><b>الشركات متعددة المجمعات:</b> Mazen Al Saeed Group، وAZ Real Estate، وAl Kifah Real Estate، وDar Wa Emaar.</li>
  <li><b>القنوات:</b> البريد الرسمي ثم الهاتف الثابت للمكتب. واتساب للأرقام المنشورة رسميًا فقط، مع احترام طلبات عدم التواصل.</li>
</ul>
</section>

<section class="page">
{hdr("قاعدة البيانات – الخبر")}
<h2>قاعدة البيانات الكاملة – الخبر</h2>
<table><thead><tr><th>الرقم</th><th>المجمع</th><th>الحي</th><th>النوع</th><th>الوحدات</th><th>التواصل</th><th>التحقق</th><th>المالك / المشغل</th><th>الدرجة</th></tr></thead><tbody>{all_rows}</tbody></table>
</section>

<section class="page">
{hdr("الثغرات والتحقق الإضافي")}
<h2>الثغرات والمعلومات التي تحتاج تحققًا</h2>
<ul>
  <li><b>{len(gaps)} مجمعًا بلا وسيلة تواصل منشورة:</b> <span class="en small">{gap_list}</span></li>
  <li><b>مواقع لم تُفتح من بيئة البحث:</b> Oasis Gardens وOasis Resorts وRima Residence. أُخذت أرقامها من نسخ محركات البحث وصُنفت غير مؤكدة.</li>
  <li><b>تعارض في عدد الوحدات:</b> المحمدية (96 / 262 / 1,152)، Desert Rose (145 / 175)، Arabian Village (126 / 134).</li>
  <li><b>تحقق ميداني مطلوب:</b> Loay Compound (وصف غير صالح في المصدر)، وAl Rushaid Village وAl Hogait وAl Bustan (ذكر في منتديات قديمة فقط).</li>
  <li><b>حدود الحصر:</b> لم نتمكن من الوصول الآلي إلى Google Maps وOpenStreetMap، فقد توجد مجمعات صغيرة غير مدرجة. لم نختبر أي رقم بالاتصال.</li>
</ul>
<h3>سجل المصادر</h3>
<table><thead><tr><th>المصدر</th><th>سجلات</th></tr></thead><tbody>{src_rows}</tbody></table>
<p class="note">تاريخ الاطلاع على كل المصادر: {R[0]["last_checked"]}. هذا التقرير للاستخدام الداخلي في تطوير الأعمال، وكل بيانات التواصل منشورة للعامة لأغراض تجارية.</p>
</section>
</body></html>"""

(OUT / "report.html").write_text(doc, encoding="utf-8")
js = f"""
import {{ chromium }} from '/opt/node-tools/node_modules/playwright/index.mjs';
const b = await chromium.launch({{ args: ['--no-sandbox'] }});
const p = await b.newPage();
await p.goto('file://{(OUT / "report.html").as_posix()}', {{ waitUntil: 'networkidle' }});
await p.evaluate(() => document.fonts.ready);
await p.pdf({{ path: '{(OUT / "ProCore_Compounds_Report_Khobar.pdf").as_posix()}', format: 'A4', printBackground: true,
  displayHeaderFooter: true, headerTemplate: '<span></span>',
  footerTemplate: '<div style="width:100%;font-size:8px;color:#888;text-align:center;font-family:sans-serif">PRO CORE · <span class=pageNumber></span> / <span class=totalPages></span></div>',
  margin: {{ top: '16mm', bottom: '16mm', left: '14mm', right: '14mm' }} }});
await b.close();
"""
(OUT / "_pdf.mjs").write_text(js)
subprocess.run(["node", str(OUT / "_pdf.mjs")], check=True)
(OUT / "_pdf.mjs").unlink()
print("ok")
