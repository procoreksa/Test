"""Combined Pro Core PDF: compounds in Al Khobar, Dammam and Jubail that have a published phone number."""
import html
import json
import pathlib
import subprocess
from collections import Counter

ROOT = pathlib.Path(__file__).parent
OUT = ROOT / "output"
ALLR = json.load(open(OUT / "compounds_master.json"))
e = html.escape

is_phone = lambda x: "Email" not in x["kind"]
R = [r for r in ALLR if any(is_phone(x) for x in r["contacts"])]
CHECKED = ALLR[0]["last_checked"]

CITY_AR = {"Al Khobar": "الخبر", "Dhahran (Greater Khobar)": "الظهران (الخبر الكبرى)", "Dammam": "الدمام",
           "Jubail Al Balad": "الجبيل البلد", "Jubail Industrial City": "الجبيل الصناعية"}
GROUPS = [("الخبر والظهران", ("Al Khobar", "Dhahran (Greater Khobar)")), ("الدمام", ("Dammam",)),
          ("الجبيل (البلد والصناعية)", ("Jubail Al Balad", "Jubail Industrial City"))]
TYPE_AR = {"Villa Compound": "فلل", "Mixed Residential Compound": "مختلط", "Apartment Compound": "شقق",
           "Luxury Residential Compound": "فاخر", "Family Compound": "عائلي", "Staff Accommodation": "سكن عمال/موظفين",
           "Corporate Housing": "سكن مؤسسي"}
VER_AR = {"Verified": "موثق", "Cross-Checked": "متقاطع", "Unverified": "غير مؤكد", "Outdated": "قديم"}
VER_CLS = {"Verified": "v", "Cross-Checked": "x", "Unverified": "u", "Outdated": "u"}


def kind_ar(k):
    k2 = k.lower()
    who = " – المشغل" if "operator" in k2 or "developer" in k2 or "group" in k2 or "owner" in k2 else \
        " – منصة" if "listing" in k2 else ""
    base = "واتساب" if "whatsapp" in k2 else "رقم موحد" if "unified" in k2 else "جوال" if "mobile" in k2 else "هاتف"
    return base + who


def best_ver(r):
    v = [x["verification"] for x in r["contacts"] if is_phone(x)]
    for lvl in ("Verified", "Cross-Checked", "Unverified", "Outdated"):
        if lvl in v:
            return lvl
    return "Unverified"


ORDER = {"Verified": 0, "Cross-Checked": 1, "Unverified": 2, "Outdated": 3}


def row(i, r):
    phones = "".join(
        f'<div class="ph"><span class="n">{e(x["value"])}</span><span class="k">{kind_ar(x["kind"])}</span>'
        f'<span class="dot {VER_CLS[x["verification"]]}"></span></div>' for x in r["contacts"] if is_phone(x))
    mails = "<br>".join(e(x["value"]) for x in r["contacts"] if not is_phone(x)) or "—"
    who = r["manager"] or r["owner"] or r["developer"] or "—"
    maps = f'<a href="{e(r["maps"])}">خريطة</a>' if r["maps"] else "—"
    web = f'<a href="{e(r["website"])}">الموقع</a>' if r["website"] else ""
    links = " · ".join(x for x in (maps, web) if x and x != "—") or "—"
    name_ar = f'<div class="ar">{e(r["name_ar"])}</div>' if r["name_ar"] else ""
    return (f'<tr><td class="c">{i}</td><td><div class="en nm">{e(r["name_en"])}</div>{name_ar}'
            f'<div class="meta">{CITY_AR[r["city"]]}{" · " + e(r["district"]) if r["district"] else ""}</div></td>'
            f'<td class="c">{TYPE_AR.get(r["type"], r["type"])}</td><td class="c">{r["units"] or "—"}</td>'
            f'<td>{phones}</td><td class="en sm">{mails}</td><td class="en sm">{e(who)}</td>'
            f'<td class="c"><span class="tag {VER_CLS[best_ver(r)]}">{VER_AR[best_ver(r)]}</span></td><td class="c sm">{links}</td></tr>')


sections = ""
n = 0
for title, cities in GROUPS:
    rows = sorted([r for r in R if r["city"] in cities], key=lambda r: (ORDER[best_ver(r)], -r["total"], r["name_en"]))
    total_city = sum(1 for r in ALLR if r["city"] in cities)
    body = "".join(row(n + i, r) for i, r in enumerate(rows, 1))
    n += len(rows)
    sections += f"""
<section class="sec">
<div class="hdr"><span class="t">دليل أرقام المجمعات السكنية</span><span class="b">PRO <i>CORE</i></span></div>
<h2>{title} <span class="cnt">{len(rows)} مجمعًا لديه رقم تواصل من أصل {total_city} مرصودة</span></h2>
<table><thead><tr><th>#</th><th>المجمع</th><th>النوع</th><th>الوحدات</th><th>أرقام التواصل</th><th>البريد</th><th>المالك / المشغل</th><th>التحقق</th><th>روابط</th></tr></thead>
<tbody>{body}</tbody></table>
</section>"""

ver = Counter(best_ver(r) for r in R)
by_group = [(t, sum(1 for r in R if r["city"] in c), sum(1 for r in ALLR if r["city"] in c)) for t, c in GROUPS]
wa = sum(1 for r in R if any("WhatsApp" in x["kind"] for x in r["contacts"]))
mail = sum(1 for r in R if any(not is_phone(x) for x in r["contacts"]))
op_only = sum(1 for r in R if all(("operator" in x["kind"] or "developer" in x["kind"] or "group" in x["kind"] or "owner" in x["kind"])
                                  for x in r["contacts"] if is_phone(x)))
srcs = sorted({x["source"] for r in R for x in r["contacts"]})
src_rows = "".join(f'<li class="en"><a href="{e(u)}">{e(u[:120])}</a></li>' for u in srcs)

css = """
@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap');
* { box-sizing: border-box; }
body { font-family: 'Cairo', 'DejaVu Sans', sans-serif; color: #1a1a1a; font-size: 9.5pt; line-height: 1.5; margin: 0; direction: rtl; }
.en { direction: ltr; unicode-bidi: isolate; text-align: right; }
.sm { font-size: 7.6pt; }
section { page-break-after: always; }
section:last-child { page-break-after: auto; }
.cover { height: 176mm; background: #111; color: #fff; padding: 18mm 18mm; position: relative; border-radius: 4px; }
.brand { color: #C9A227; font-weight: 800; letter-spacing: 6px; font-size: 26pt; direction: ltr; text-align: right; }
.brand small { display: block; font-size: 9.5pt; letter-spacing: 3px; color: #d9c27a; font-weight: 600; }
.rule { height: 3px; width: 80px; background: #C9A227; margin: 12mm 0 8mm auto; }
.cover h1 { font-size: 28pt; line-height: 1.3; font-weight: 800; margin: 0; }
.cover h1 span { color: #C9A227; }
.cover .sub { font-size: 13pt; color: #ddd; margin-top: 4mm; }
.cover .meta { position: absolute; bottom: 14mm; right: 18mm; left: 18mm; border-top: 1px solid #C9A227; padding-top: 4mm; color: #ccc; font-size: 10pt; display: flex; justify-content: space-between; }
.hdr { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #C9A227; padding-bottom: 2mm; margin-bottom: 4mm; }
.hdr .b { font-weight: 800; letter-spacing: 3px; direction: ltr; }
.hdr .b i { color: #C9A227; font-style: normal; }
.hdr .t { color: #777; font-size: 8.5pt; }
h2 { font-size: 16pt; font-weight: 800; margin: 0 0 3mm; }
h2::before { content: ''; display: inline-block; width: 8px; height: 18px; background: #C9A227; margin-left: 8px; vertical-align: -2px; }
h2 .cnt { font-size: 9.5pt; font-weight: 600; color: #777; margin-right: 3mm; }
h3 { font-size: 11.5pt; margin: 4mm 0 2mm; }
.kpis { display: grid; grid-template-columns: repeat(5, 1fr); gap: 4mm; margin: 4mm 0 5mm; }
.kpi { background: #111; color: #fff; padding: 3.5mm; border-radius: 3px; border-top: 3px solid #C9A227; }
.kpi b { display: block; font-size: 19pt; color: #C9A227; line-height: 1.1; }
.kpi span { font-size: 8.5pt; color: #ddd; }
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; }
.box { border: 1px solid #e3dcc4; background: #fcfaf3; padding: 3.5mm 4mm; border-radius: 3px; }
ul { margin: 0; padding-right: 5mm; } li { margin-bottom: 1mm; }
table { width: 100%; border-collapse: collapse; font-size: 8.2pt; }
th { background: #111; color: #C9A227; font-weight: 700; padding: 1.8mm 1.5mm; text-align: right; }
td { border-bottom: 1px solid #e6e1d0; padding: 1.4mm 1.5mm; vertical-align: top; line-height: 1.35; }
tr:nth-child(even) td { background: #faf8f1; }
thead { display: table-header-group; } tr { page-break-inside: avoid; }
td.c { text-align: center; }
.nm { font-weight: 700; font-size: 8.8pt; }
.ar { font-size: 8pt; color: #444; }
.meta { font-size: 7.5pt; color: #888; }
.ph { display: flex; align-items: center; gap: 1.5mm; white-space: nowrap; }
.ph .n { direction: ltr; unicode-bidi: isolate; font-weight: 700; font-size: 8.6pt; }
.ph .k { font-size: 7pt; color: #888; }
.dot { width: 6px; height: 6px; border-radius: 50%; display: inline-block; }
.dot.v, .tag.v { background: #2e7d32; } .dot.x, .tag.x { background: #C9A227; } .dot.u, .tag.u { background: #b0b0b0; }
.tag { color: #fff; font-size: 7.4pt; font-weight: 700; padding: 0 2mm; border-radius: 2px; white-space: nowrap; }
.tag.x { color: #111; }
.legend span { margin-left: 5mm; font-size: 8.5pt; }
a { color: #7a5f00; text-decoration: none; }
.note { font-size: 8pt; color: #666; }
.src { columns: 2; font-size: 7.4pt; }
"""

doc = f"""<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>Pro Core – دليل أرقام المجمعات السكنية</title><style>{css}</style></head><body>
<section><div class="cover">
  <div class="brand">PRO CORE<small>PROPERTY MANAGEMENT · MEDIA</small></div>
  <div class="rule"></div>
  <h1>دليل <span>أرقام التواصل</span><br>للمجمعات السكنية</h1>
  <div class="sub">الخبر · الدمام · الجبيل – المجمعات التي تتوفر لها أرقام هاتف منشورة فقط</div>
  <div class="meta"><span>للاستخدام الداخلي – تطوير الأعمال</span><span>تاريخ التحقق: {CHECKED}</span><span>{len(R)} مجمعًا</span></div>
</div></section>

<section>
<div class="hdr"><span class="t">الملخص</span><span class="b">PRO <i>CORE</i></span></div>
<h2>الملخص</h2>
<p>يضم هذا الدليل {len(R)} مجمعًا سكنيًا لديها رقم هاتف منشور، من أصل {len(ALLR)} مجمعًا رصدناها في المدن الثلاث. {ver["Verified"] + ver["Cross-Checked"]} منها رقمها موثق من موقع رسمي أو مطابق في مصدرين مستقلين.</p>
<div class="kpis">
  <div class="kpi"><b>{len(R)}</b><span>مجمعًا برقم تواصل</span></div>
  <div class="kpi"><b>{ver["Verified"] + ver["Cross-Checked"]}</b><span>رقم موثق أو متقاطع</span></div>
  <div class="kpi"><b>{wa}</b><span>بواتساب رسمي</span></div>
  <div class="kpi"><b>{mail}</b><span>ببريد إلكتروني أيضًا</span></div>
  <div class="kpi"><b>{op_only}</b><span>رقمها للشركة المشغلة</span></div>
</div>
<div class="grid2">
<div class="box"><h3>حسب المدينة</h3><ul>{"".join(f"<li><b>{t}:</b> {a} برقم تواصل من أصل {b}</li>" for t, a, b in by_group)}</ul></div>
<div class="box"><h3>كيف تقرأ الجداول</h3>
<p class="legend"><span><span class="dot v"></span> موثق: من الموقع الرسمي</span><span><span class="dot x"></span> متقاطع: مطابق في مصدرين</span><span><span class="dot u"></span> غير مؤكد: مصدر واحد أو منصة</span></p>
<ul>
<li>"– المشغل" يعني أن الرقم للشركة المالكة أو المشغلة وليس لمكتب المجمع نفسه.</li>
<li>"– منصة" يعني أن الرقم منشور على منصة إعلانات للمجمع ولم نجده في موقع رسمي.</li>
<li>داخل كل مدينة، الترتيب من الأرقام الأكثر موثوقية إلى الأقل.</li>
</ul></div>
</div>
<h3>ملاحظات مهمة</h3>
<ul>
<li>لم نختبر أي رقم بالاتصال. الرقم المنشور قد يكون تغيّر، فيُنصح بالتحقق عند أول تواصل.</li>
<li>استُبعد رقما منصة RightCompound (+966 56 399 0906 و+966 56 917 9871)، لأنهما للمنصة لا للمجمعات.</li>
<li>الدمام أضعف المدن في البيانات المنشورة: رصدنا 3 مجمعات فقط، أحدها برقم. المجمعات الصغيرة في الدمام غالبًا تُدار بالهاتف دون مواقع، وتحتاج حصرًا ميدانيًا أو من خرائط Google يدويًا.</li>
<li>{len(ALLR) - len(R)} مجمعًا مرصودًا بلا رقم منشور، وهي موجودة في ملف Excel الكامل وليست في هذا الدليل.</li>
</ul>
</section>
{sections}
<section>
<div class="hdr"><span class="t">مصادر أرقام التواصل</span><span class="b">PRO <i>CORE</i></span></div>
<h2>مصادر أرقام التواصل</h2>
<p class="note">تاريخ الاطلاع على كل المصادر: {CHECKED}. كل البيانات منشورة للعامة لأغراض تجارية.</p>
<ul class="src">{src_rows}</ul>
</section>
</body></html>"""

(OUT / "contacts.html").write_text(doc, encoding="utf-8")
pdf = OUT / "ProCore_Compounds_Contacts_EasternProvince.pdf"
js = f"""
import {{ chromium }} from '/opt/node-tools/node_modules/playwright/index.mjs';
const b = await chromium.launch({{ args: ['--no-sandbox'] }});
const p = await b.newPage();
await p.goto('file://{(OUT / "contacts.html").as_posix()}', {{ waitUntil: 'networkidle' }});
await p.evaluate(() => document.fonts.ready);
await p.pdf({{ path: '{pdf.as_posix()}', format: 'A4', landscape: true, printBackground: true,
  displayHeaderFooter: true, headerTemplate: '<span></span>',
  footerTemplate: '<div style="width:100%;font-size:8px;color:#888;text-align:center;font-family:sans-serif">PRO CORE · <span class=pageNumber></span> / <span class=totalPages></span></div>',
  margin: {{ top: '12mm', bottom: '14mm', left: '12mm', right: '12mm' }} }});
await b.close();
"""
(OUT / "_pdf.mjs").write_text(js)
subprocess.run(["node", str(OUT / "_pdf.mjs")], check=True)
(OUT / "_pdf.mjs").unlink()
(OUT / "contacts.html").unlink()
print(len(R), "compounds ->", pdf.name)
