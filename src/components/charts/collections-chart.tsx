"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from "recharts";
import { numberFormatter } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/config";

interface Point {
  label: string;
  invoiced: number;
  collected: number;
}

export function CollectionsChart({
  data,
  labels,
  locale,
}: {
  data: Point[];
  labels: { invoiced: string; collected: string };
  locale: Locale;
}) {
  const currency = numberFormatter(locale);

  return (
    <div className="h-72 w-full" dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#64748b" }} axisLine={{ stroke: "#e2e8f0" }} tickLine={false} />
          <YAxis tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} width={56} />
          <Tooltip
            formatter={(value) => currency.format(Number(value))}
            contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13 }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="invoiced" name={labels.invoiced} fill="#3f3f46" radius={[4, 4, 0, 0]} />
          <Bar dataKey="collected" name={labels.collected} fill="#d4af37" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
