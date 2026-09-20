import Link from "next/link";
import { getDashboardStats } from "@/lib/actions/dashboard";
import { StatCard } from "@/components/stat-card";
import { CollectionsChart } from "@/components/charts/collections-chart";

const sar = new Intl.NumberFormat("ar-SA", { style: "currency", currency: "SAR" });
const dateFmt = new Intl.DateTimeFormat("ar-SA", { day: "numeric", month: "short" });

export default async function DashboardPage() {
  const stats = await getDashboardStats();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">لوحة التحكم</h1>
        <p className="text-slate-500 text-sm mt-1">نظرة عامة على أداء التحصيل والإشغال والفواتير الضريبية</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="نسبة الإشغال"
          value={`${stats.occupancyRate}%`}
          hint={`${stats.unitsOccupied} من ${stats.unitsTotal} وحدة`}
        />
        <StatCard label="العقود النشطة" value={String(stats.contractsActive)} />
        <StatCard
          label="إجمالي المحصّل"
          value={sar.format(stats.totalCollected)}
          tone="positive"
          hint={`من إجمالي ${sar.format(stats.totalInvoiced)}`}
        />
        <StatCard
          label="مبالغ متأخرة"
          value={sar.format(stats.totalOutstanding)}
          tone={stats.totalOutstanding > 0 ? "danger" : "positive"}
          hint={`${stats.overdueCount} دفعة متأخرة`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <h2 className="font-semibold text-slate-800 mb-4">المفوتر مقابل المحصّل (آخر 6 أشهر)</h2>
          <CollectionsChart data={stats.monthlySeries} />
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-800">دفعات متأخرة</h2>
            <Link href="/collections" className="text-sm text-brand-gold-dark hover:underline">
              عرض الكل
            </Link>
          </div>
          {stats.overdueSchedules.length === 0 ? (
            <p className="text-sm text-slate-400">لا توجد دفعات متأخرة 🎉</p>
          ) : (
            <ul className="space-y-3">
              {stats.overdueSchedules.map((s) => (
                <li key={s.id} className="flex items-center justify-between text-sm border-b border-slate-100 pb-2 last:border-0">
                  <div>
                    <p className="font-medium text-slate-800">{s.contract.renter.fullName}</p>
                    <p className="text-slate-400 text-xs">
                      وحدة {s.contract.unit.unitNumber} · استحقاق {dateFmt.format(s.dueDate)}
                    </p>
                  </div>
                  <span className="text-red-600 font-semibold">{sar.format(Number(s.amount))}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
        <h2 className="font-semibold text-slate-800 mb-1">صافي ضريبة القيمة المضافة المُحصّلة</h2>
        <p className="text-3xl font-bold text-brand-gold-dark">{sar.format(stats.totalVat)}</p>
        <p className="text-xs text-slate-400 mt-1">إجمالي ضريبة القيمة المضافة على كل الفواتير الصادرة (15%)</p>
      </div>
    </div>
  );
}
