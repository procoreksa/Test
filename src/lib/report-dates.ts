import { format, startOfMonth } from "date-fns";

export function defaultMonthRange(): { from: string; to: string } {
  const today = new Date();
  return { from: format(startOfMonth(today), "yyyy-MM-dd"), to: format(today, "yyyy-MM-dd") };
}

export function defaultExpiringRange(): { from: string; to: string } {
  const today = new Date();
  const in90Days = new Date(today);
  in90Days.setDate(in90Days.getDate() + 90);
  return { from: format(today, "yyyy-MM-dd"), to: format(in90Days, "yyyy-MM-dd") };
}
