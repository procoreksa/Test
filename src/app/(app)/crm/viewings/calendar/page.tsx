import Link from "next/link";
import { getViewingScheduleReport } from "@/lib/actions/viewing-reports";
import { getLocale, getDictionary, shortDateFormatter, shortTimeFormatter, pickLocalized } from "@/lib/i18n";
import { dateBucketRange } from "@/lib/crm/viewing-rules";

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 24 * 60 * 60 * 1000);
}

export default async function ViewingCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string }>;
}) {
  const params = await searchParams;
  const locale = await getLocale();
  const t = getDictionary(locale);
  const dateFmt = shortDateFormatter(locale);
  const timeFmt = shortTimeFormatter(locale);

  const view = params.view === "week" ? "week" : "day";
  const anchor = params.date ? new Date(`${params.date}T00:00:00`) : new Date();

  const range =
    view === "day"
      ? { from: new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate()), to: new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + 1) }
      : dateBucketRange("thisWeek", anchor);

  const viewings = await getViewingScheduleReport(range.from, new Date(range.to.getTime() - 1));

  function hrefFor(nextView: "day" | "week", nextDate: Date) {
    const usp = new URLSearchParams({ view: nextView, date: nextDate.toISOString().slice(0, 10) });
    return `/crm/viewings/calendar?${usp.toString()}`;
  }

  const days: Date[] = view === "day" ? [range.from] : Array.from({ length: 7 }, (_, i) => addDays(range.from, i));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t.viewing.calendarTitle}</h1>
          <p className="text-slate-500 text-sm mt-1">{t.viewing.calendarSubtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={hrefFor("day", anchor)} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${view === "day" ? "bg-brand-gold text-brand-black" : "bg-slate-100 text-slate-600"}`}>
            {t.viewing.calendarDay}
          </Link>
          <Link href={hrefFor("week", anchor)} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${view === "week" ? "bg-brand-gold text-brand-black" : "bg-slate-100 text-slate-600"}`}>
            {t.viewing.calendarWeek}
          </Link>
          <Link href={hrefFor(view, addDays(anchor, view === "day" ? -1 : -7))} className="text-brand-gold-dark hover:underline text-sm px-2">
            ←
          </Link>
          <span className="text-sm text-slate-600 font-medium">{dateFmt.format(anchor)}</span>
          <Link href={hrefFor(view, addDays(anchor, view === "day" ? 1 : 7))} className="text-brand-gold-dark hover:underline text-sm px-2">
            →
          </Link>
        </div>
      </div>

      <div className="space-y-4">
        {days.map((day) => {
          const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate());
          const dayEnd = addDays(dayStart, 1);
          const dayViewings = viewings
            .filter((v) => v.scheduledStart >= dayStart && v.scheduledStart < dayEnd)
            .sort((a, b) => a.scheduledStart.getTime() - b.scheduledStart.getTime());

          return (
            <div key={day.toISOString()} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
              {view === "week" && <div className="px-4 py-2 bg-slate-50 font-medium text-slate-700 text-sm">{dateFmt.format(day)}</div>}
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500 text-right">
                  <tr>
                    <th className="px-4 py-2 font-medium">{t.viewing.colTime}</th>
                    <th className="px-4 py-2 font-medium">{t.viewing.colLead}</th>
                    <th className="px-4 py-2 font-medium">{t.viewing.colCompound}</th>
                    <th className="px-4 py-2 font-medium">{t.viewing.colUnits}</th>
                    <th className="px-4 py-2 font-medium">{t.viewing.colAgent}</th>
                    <th className="px-4 py-2 font-medium">{t.viewing.colStatus}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {dayViewings.map((v) => (
                    <tr key={v.id}>
                      <td className="px-4 py-2 text-slate-500 whitespace-nowrap">
                        {timeFmt.format(v.scheduledStart)} - {timeFmt.format(v.scheduledEnd)}
                      </td>
                      <td className="px-4 py-2 text-slate-700">
                        <Link href={`/crm/viewings/${v.id}`} className="hover:underline">
                          {v.lead.fullName}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-slate-500">
                        {v.units[0] ? pickLocalized(locale, v.units[0].unit.floor.building.compound.arabicName, v.units[0].unit.floor.building.compound.name) : "—"}
                      </td>
                      <td className="px-4 py-2 text-slate-500">{v.units.map((u) => u.unit.unitNumber).join(", ")}</td>
                      <td className="px-4 py-2 text-slate-500">{v.assignedToUser?.name ?? "—"}</td>
                      <td className="px-4 py-2 text-slate-600">{t.viewingStatus[v.status]}</td>
                    </tr>
                  ))}
                  {dayViewings.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                        {t.viewing.calendarEmpty}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    </div>
  );
}
