"""Build the compounds master files (JSON, CSV, XLSX) from the batch record files."""
import csv
import json
import pathlib

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

from data import khobar_records as kh
from data import dammam_jubail_records as dj

ROOT = pathlib.Path(__file__).parent
OUT = ROOT / "output"
OUT.mkdir(exist_ok=True)
RC_BASE = "https://rightcompound.com/compounds/khobar/"
PLATFORM_NUMBERS = {"+966563990906", "+966569179871", "00966569179871"}

rc = {r["slug"]: r for r in json.load(open(ROOT / "raw" / "rightcompound_khobar.json"))}
rcj = {r["slug"]: r for r in json.load(open(ROOT / "raw" / "rightcompound_jubail.json"))}
PREFIX = {"Al Khobar": "KHB", "Dhahran (Greater Khobar)": "DHN", "Dammam": "DMM",
          "Jubail Al Balad": "JBB", "Jubail Industrial City": "JBI"}
ALL = ([(r, "Al Khobar", RC_BASE) for r in kh.RECORDS] + [(r, "Dammam", RC_BASE) for r in dj.DAMMAM]
       + [(r, "Jubail Al Balad", "https://rightcompound.com/compounds/jubail/") for r in dj.JUBAIL])
counters = {}


def norm_phone(p):
    d = "".join(ch for ch in p if ch.isdigit() or ch == "+")
    return d


def score(r):
    """Lead score components; no points without evidence."""
    u = r.get("units") or 0
    size = 20 if u >= 200 else 15 if u >= 100 else 10 if u >= 50 else 5 if u > 0 else 0
    t = r["type"]
    if r.get("category"):
        fit = 8
    elif t in ("Villa Compound", "Family Compound", "Mixed Residential Compound", "Luxury Residential Compound"):
        fit = 20 if r["mgmt"] in ("Unknown", "Owner Managed") else 15
    elif t == "Apartment Compound":
        fit = 15
    else:
        fit = 12
    if "Under construction" in (r.get("status") or ""):
        fit = min(25, fit + 5)
    need = 0
    if not r.get("website"):
        need += 8
    if not any(r.get("social", {}).values()):
        need += 6
    if r.get("slug") or any("compoundin" in s or "propertyfinder" in s for s in r["sources"]):
        need += 6
    ver = [x for x in r["contacts"] if x["verification"] in ("Verified", "Cross-Checked")]
    has_phone = any("Phone" in x["kind"] or "Mobile" in x["kind"] or "number" in x["kind"] for x in r["contacts"])
    has_email = any("Email" in x["kind"] for x in r["contacts"])
    if ver and has_phone and has_email:
        contact = 15
    elif ver:
        contact = 10
    elif r["contacts"]:
        contact = 5
    else:
        contact = 0
    party = 10 if (r.get("owner") or r.get("manager") or r.get("developer")) and r.get("mgmt_src") else \
        5 if (r.get("owner") or r.get("manager") or r.get("developer")) else 0
    collab = 10 if ("Under construction" in (r.get("status") or "") or r.get("opened") in ("2024", "2025", "2026")) else \
        5 if r.get("slug") else 0
    return dict(s_size=size, s_fit=fit, s_need=need, s_contact=contact, s_party=party, s_collab=collab)


def opportunities(r, s):
    o = []
    if r["mgmt"] in ("Unknown", "Owner Managed") and r["type"] != "Corporate Housing":
        o.append("Property management")
    if r.get("slug") or s["s_need"] >= 6:
        o.append("Marketing & leasing")
    if not any(r.get("social", {}).values()):
        o.append("Social media management")
    if not r.get("website") or s["s_need"] >= 14:
        o.append("Content & photography")
    if r.get("social") and any(r["social"].values()):
        o.append("Paid ad campaigns")
    if len(o) >= 4:
        o.append("Integrated services")
    return o


records = []
for r, default_city, rc_base in ALL:
    city = r.get("city", default_city)
    counters[city] = counters.get(city, 0) + 1
    base = (rcj if "jubail" in rc_base else rc).get(r.get("slug")) or {}
    addr = base.get("addr") if isinstance(base.get("addr"), dict) else {}
    lat, lng = (base.get("geo") or [None, None])[:2]
    contacts = [x for x in r.get("contacts", []) if norm_phone(x["value"]) not in PLATFORM_NUMBERS]
    srcs = list(dict.fromkeys(([rc_base + r["slug"]] if r.get("slug") else []) + r.get("sources", [])
                              + [x["source"] for x in contacts]))
    rec = dict(
        id=f"{PREFIX[city]}-{counters[city]:03d}", name_en=r["name_en"], name_ar=r.get("name_ar", ""),
        city=city, district=r.get("district", ""),
        address=(addr.get("streetAddress") or "").strip(),
        lat=lat, lng=lng,
        maps=f"https://www.google.com/maps?q={lat},{lng}" if lat and lng else "",
        type=r["type"], category=r.get("category", "Residential compound"),
        status=r.get("status", "Operating (listed)" if r.get("slug") or r.get("website") else "Unknown"),
        opened=r.get("opened", ""), units=r.get("units"), unit_types=r.get("unit_types", ""),
        facilities=(base.get("amen") or "")[:250], website=r.get("website", ""),
        owner=r.get("owner", ""), developer=r.get("developer", ""), manager=r.get("manager", ""),
        mgmt=r.get("mgmt", "Unknown"), mgmt_src=r.get("mgmt_src", ""),
        contacts=contacts, social=r.get("social", {}), sources=srcs, notes=r.get("notes", ""),
        slug=r.get("slug"), last_checked=kh.CHECKED,
    )
    s = score(rec)
    rec.update(s)
    rec["total"] = sum(s.values())
    rec["opps"] = opportunities(rec, s)
    records.append(rec)

# dedupe guard on normalised English name
seen = {}
for rec in records:
    k = "".join(ch for ch in rec["name_en"].lower() if ch.isalnum())
    assert k not in seen, f"duplicate: {rec['name_en']} / {seen[k]}"
    seen[k] = rec["name_en"]

json.dump(records, open(OUT / "compounds_master.json", "w"), ensure_ascii=False, indent=1)


def first(rec, *kinds):
    for x in rec["contacts"]:
        if any(k in x["kind"] for k in kinds):
            return x["value"]
    return ""


def emails(rec):
    return " ; ".join(x["value"] for x in rec["contacts"] if "Email" in x["kind"])


def verif(rec):
    v = [x["verification"] for x in rec["contacts"]]
    for lvl in ("Verified", "Cross-Checked", "Unverified", "Outdated"):
        if lvl in v:
            return lvl
    return "Not Available"


MASTER_COLS = [
    ("ID", 9, lambda r: r["id"]), ("Compound (EN)", 30, lambda r: r["name_en"]), ("Compound (AR)", 24, lambda r: r["name_ar"]),
    ("City", 16, lambda r: r["city"]), ("District", 24, lambda r: r["district"]), ("Address", 30, lambda r: r["address"]),
    ("Google Maps", 14, lambda r: r["maps"]), ("Latitude", 11, lambda r: r["lat"]), ("Longitude", 11, lambda r: r["lng"]),
    ("Compound Type", 22, lambda r: r["type"]), ("Category", 20, lambda r: r["category"]), ("Status", 18, lambda r: r["status"]),
    ("Opened", 8, lambda r: r["opened"]), ("Units", 8, lambda r: r["units"]), ("Unit Types", 28, lambda r: r["unit_types"]),
    ("Facilities", 32, lambda r: r["facilities"]), ("Website", 26, lambda r: r["website"]),
    ("Main Phone", 16, lambda r: first(r, "Phone", "Unified")), ("Mobile", 16, lambda r: first(r, "Mobile")),
    ("WhatsApp", 16, lambda r: first(r, "WhatsApp")), ("Emails", 30, emails),
    ("Instagram", 22, lambda r: r["social"].get("ig", "")), ("Facebook", 22, lambda r: r["social"].get("fb", "")),
    ("LinkedIn", 22, lambda r: r["social"].get("li", "")), ("Other Social", 22, lambda r: r["social"].get("other", "")),
    ("Owner", 24, lambda r: r["owner"]), ("Developer", 20, lambda r: r["developer"]), ("Property Manager / Operator", 24, lambda r: r["manager"]),
    ("Management Type", 22, lambda r: r["mgmt"]), ("Ownership Source", 22, lambda r: r["mgmt_src"]),
    ("Contact Verification", 16, verif), ("Opportunities", 30, lambda r: ", ".join(r["opps"])),
    ("Size (20)", 8, lambda r: r["s_size"]), ("Fit (25)", 8, lambda r: r["s_fit"]), ("Need (20)", 8, lambda r: r["s_need"]),
    ("Contact (15)", 8, lambda r: r["s_contact"]), ("Party (10)", 8, lambda r: r["s_party"]), ("Collab (10)", 8, lambda r: r["s_collab"]),
    ("Lead Score", 9, None), ("Priority", 9, None),
    ("Notes", 40, lambda r: r["notes"]), ("Sources", 40, lambda r: " ; ".join(r["sources"])), ("Last Checked", 12, lambda r: r["last_checked"]),
]

with open(OUT / "compounds_master.csv", "w", newline="", encoding="utf-8-sig") as f:
    w = csv.writer(f)
    w.writerow([c[0] for c in MASTER_COLS])
    for r in records:
        w.writerow([c[2](r) if c[2] else (r["total"] if c[0] == "Lead Score" else
                    ("A" if r["total"] >= 80 else "B" if r["total"] >= 60 else "C")) for c in MASTER_COLS])

# ---------- XLSX ----------
BLACK, GOLD, LIGHT = "111111", "C9A227", "F6F1DE"
HFONT = Font(name="Arial", bold=True, color=GOLD, size=10)
HFILL = PatternFill("solid", fgColor=BLACK)
BFONT = Font(name="Arial", size=9)
LFONT = Font(name="Arial", size=9, color="1F4E99", underline="single")
THIN = Border(bottom=Side(style="thin", color="DDDDDD"))


def header(ws, cols):
    for j, (name, width, _) in enumerate(cols, 1):
        cell = ws.cell(row=1, column=j, value=name)
        cell.font, cell.fill = HFONT, HFILL
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        ws.column_dimensions[get_column_letter(j)].width = width
    ws.row_dimensions[1].height = 30
    ws.freeze_panes = "C2"


def link(cell, url, text=None):
    if url and str(url).startswith("http"):
        cell.value = text or url
        cell.hyperlink = url
        cell.font = LFONT


def write_master(ws, rows):
    header(ws, MASTER_COLS)
    names = [c[0] for c in MASTER_COLS]
    sc = {n: get_column_letter(names.index(n) + 1) for n in names}
    for i, r in enumerate(rows, 2):
        for j, (name, _, fn) in enumerate(MASTER_COLS, 1):
            cell = ws.cell(row=i, column=j)
            cell.font, cell.border = BFONT, THIN
            cell.alignment = Alignment(vertical="top", wrap_text=name in ("Notes", "Sources", "Facilities", "Unit Types"))
            if name == "Lead Score":
                cell.value = f"=SUM({sc['Size (20)']}{i}:{sc['Collab (10)']}{i})"
                cell.font = Font(name="Arial", size=9, bold=True)
            elif name == "Priority":
                cell.value = f'=IF({sc["Lead Score"]}{i}>=80,"A",IF({sc["Lead Score"]}{i}>=60,"B","C"))'
                cell.font = Font(name="Arial", size=9, bold=True)
            else:
                v = fn(r)
                if name == "Google Maps":
                    link(cell, v, "Open map")
                elif name in ("Website", "Instagram", "Facebook", "LinkedIn", "Ownership Source"):
                    link(cell, v)
                    if not cell.value:
                        cell.value = v or None
                else:
                    cell.value = v if v not in ("", None) else None
    ws.auto_filter.ref = f"A1:{get_column_letter(len(MASTER_COLS))}{max(2, len(rows) + 1)}"


wb = Workbook()
ws = wb.active
ws.title = "Master Database"
write_master(ws, records)
for title, pred in (("Al Khobar", lambda r: r["city"] in ("Al Khobar", "Dhahran (Greater Khobar)")),
                    ("Dammam", lambda r: r["city"] == "Dammam"), ("Jubail", lambda r: r["city"].startswith("Jubail"))):
    s = wb.create_sheet(title)
    write_master(s, [r for r in records if pred(r)])

# Priority leads: sorted by score (values; sheet formulas recompute the Master copy)
pl = wb.create_sheet("Priority Leads")
PCOLS = [("Rank", 6, None), ("ID", 9, None), ("Compound", 32, None), ("City", 14, None), ("District", 22, None),
         ("Type", 22, None), ("Units", 7, None), ("Lead Score", 9, None), ("Priority", 8, None),
         ("Best Contact", 26, None), ("Contact Verification", 14, None), ("Opportunities", 40, None),
         ("Pro Core Property Mgmt fit", 22, None), ("Pro Core Media fit", 22, None)]
header(pl, PCOLS)
ranked = sorted(records, key=lambda r: (-r["total"], r["name_en"]))
LS = get_column_letter([c[0] for c in MASTER_COLS].index("Lead Score") + 1)
for i, r in enumerate(ranked, 2):
    best = next((x["value"] for x in r["contacts"] if x["verification"] in ("Verified", "Cross-Checked")),
                r["contacts"][0]["value"] if r["contacts"] else "")
    pm = "High" if "Property management" in r["opps"] and r["s_size"] >= 10 else "Medium" if "Property management" in r["opps"] else "Low"
    md = "High" if sum(o in r["opps"] for o in ("Social media management", "Content & photography", "Paid ad campaigns")) >= 2 else \
        "Medium" if any(o in r["opps"] for o in ("Social media management", "Content & photography", "Paid ad campaigns")) else "Low"
    vals = [i - 1, r["id"], r["name_en"], r["city"], r["district"], r["type"], r["units"],
            f"=INDEX('Master Database'!${LS}:${LS},MATCH(B{i},'Master Database'!$A:$A,0))",
            f'=IF(H{i}>=80,"A",IF(H{i}>=60,"B","C"))', best, verif(r), ", ".join(r["opps"]), pm, md]
    for j, v in enumerate(vals, 1):
        c_ = pl.cell(row=i, column=j, value=v)
        c_.font, c_.border = BFONT, THIN
pl.auto_filter.ref = f"A1:N{len(ranked) + 1}"

# Contact verification: one row per contact point
cv = wb.create_sheet("Contact Verification")
CCOLS = [("ID", 9, None), ("Compound", 30, None), ("Contact Type", 26, None), ("Value", 28, None),
         ("Belongs To", 18, None), ("Verification", 14, None), ("Source", 50, None),
         ("Published Date", 12, None), ("Checked On", 12, None), ("Confidence", 10, None), ("Notes", 40, None)]
header(cv, CCOLS)
row = 2
for r in records:
    for x in r["contacts"]:
        belongs = "Operator / group" if "operator" in x["kind"] or "group" in x["kind"] or "developer" in x["kind"] else \
            "Aggregator listing" if "listing" in x["kind"] else "Compound"
        conf = {"Verified": "High", "Cross-Checked": "High", "Unverified": "Low", "Outdated": "Low"}[x["verification"]]
        vals = [r["id"], r["name_en"], x["kind"], x["value"], belongs, x["verification"], None,
                "Not stated", r["last_checked"], conf, x["note"]]
        for j, v in enumerate(vals, 1):
            c_ = cv.cell(row=row, column=j, value=v)
            c_.font, c_.border = BFONT, THIN
        link(cv.cell(row=row, column=7), x["source"])
        row += 1
cv.auto_filter.ref = f"A1:K{row - 1}"

# BD tracker
bd = wb.create_sheet("Business Development Tracker")
BCOLS = [(n, w, None) for n, w in [("Compound Name", 30), ("Contact Person / Department", 24), ("Contact Channel", 16),
                                   ("First Contact Date", 14), ("Last Follow-Up", 14), ("Lead Status", 16),
                                   ("Interested Services", 26), ("Meeting Date", 13), ("Proposal Sent", 12),
                                   ("Next Action", 28), ("Notes", 40)]]
header(bd, BCOLS)
dv_status = DataValidation(type="list", formula1='"Not contacted,Contacted,Replied,Meeting booked,Proposal sent,Won,Lost,Do not contact"', allow_blank=True)
dv_chan = DataValidation(type="list", formula1='"Email,Phone,WhatsApp,LinkedIn,Visit,Contact form"', allow_blank=True)
dv_yes = DataValidation(type="list", formula1='"Yes,No"', allow_blank=True)
for d in (dv_status, dv_chan, dv_yes):
    bd.add_data_validation(d)
for i, r in enumerate(ranked, 2):
    bd.cell(row=i, column=1, value=r["name_en"]).font = BFONT
    bd.cell(row=i, column=6, value="Not contacted").font = BFONT
    for col in "DEH":
        bd[f"{col}{i}"].number_format = "yyyy-mm-dd"
dv_status.add(f"F2:F{len(ranked) + 200}")
dv_chan.add(f"C2:C{len(ranked) + 200}")
dv_yes.add(f"I2:I{len(ranked) + 200}")
bd.auto_filter.ref = f"A1:K{len(ranked) + 1}"

# Sources
so = wb.create_sheet("Sources")
SCOLS = [("Source URL", 90, None), ("Used For (records)", 12, None), ("Type", 22, None), ("Accessed", 12, None)]
header(so, SCOLS)
cnt = {}
for r in records:
    for s_ in r["sources"]:
        cnt[s_] = cnt.get(s_, 0) + 1


def stype(u):
    if "rightcompound" in u or "compoundin" in u:
        return "Compound directory"
    if "propertyfinder" in u or "whichschool" in u or "soulofsaudi" in u:
        return "Guide / article"
    if "expat.com" in u:
        return "Expat forum"
    if "trip.com" in u or "kayak" in u:
        return "Booking platform"
    return "Official / operator site"


for i, (u, n) in enumerate(sorted(cnt.items(), key=lambda t: -t[1]), 2):
    link(so.cell(row=i, column=1), u)
    so.cell(row=i, column=2, value=n).font = BFONT
    so.cell(row=i, column=3, value=stype(u)).font = BFONT
    so.cell(row=i, column=4, value=kh.CHECKED).font = BFONT
r0 = len(cnt) + 3
so.cell(row=r0, column=1, value="Excluded during review (not compounds):").font = Font(name="Arial", bold=True, size=9)
for k, (n, why, u) in enumerate(kh.EXCLUDED, r0 + 1):
    so.cell(row=k, column=1, value=f"{n} - {why}").font = BFONT
    link(so.cell(row=k, column=3), u, "source")
so.cell(row=r0 + len(kh.EXCLUDED) + 2, column=1,
        value="Note: +966 56 399 0906 on RightCompound pages is the platform's own number and is excluded from compound contacts.").font = Font(name="Arial", italic=True, size=9)

for s_ in wb.worksheets:
    s_.sheet_view.zoomScale = 90
wb.save(OUT / "ProCore_Compounds_Database.xlsx")

n = len(records)
print(json.dumps(dict(
    records=n,
    with_phone=sum(1 for r in records if any("Email" not in x["kind"] for x in r["contacts"])),
    with_email=sum(1 for r in records if any("Email" in x["kind"] for x in r["contacts"])),
    with_whatsapp=sum(1 for r in records if any("WhatsApp" in x["kind"] for x in r["contacts"])),
    verified_records=sum(1 for r in records if verif(r) in ("Verified", "Cross-Checked")),
    no_contact=sum(1 for r in records if not r["contacts"]),
    with_coords=sum(1 for r in records if r["lat"]),
    with_operator=sum(1 for r in records if r["owner"] or r["manager"] or r["developer"]),
    priority=dict(A=sum(r["total"] >= 80 for r in records), B=sum(60 <= r["total"] < 80 for r in records),
                  C=sum(r["total"] < 60 for r in records)),
    excluded=len(kh.EXCLUDED),
), indent=1))
