import type { Metadata } from "next";
import { Cairo } from "next/font/google";
import "./globals.css";

const cairo = Cairo({
  variable: "--font-cairo",
  subsets: ["arabic", "latin"],
});

export const metadata: Metadata = {
  title: "عقاري | نظام إدارة الإيجارات والفواتير الضريبية",
  description: "منصة SaaS لإدارة العقارات والوحدات والمستأجرين ومتابعة التحصيلات وإصدار الفواتير الضريبية المتوافقة مع فاتورة (ZATCA)",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ar" dir="rtl" className={`${cairo.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900">{children}</body>
    </html>
  );
}
