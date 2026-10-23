import ExcelJS from "exceljs";
import { fromBaisa } from "@/lib/money";
import type { ReportResult } from "./services/reports";

function cellText(v: unknown, type?: string): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "bigint") return fromBaisa(v);
  if (type === "percent" && typeof v === "number") return v.toFixed(2);
  return String(v);
}

/** CSV بترميز UTF-8 مع BOM ليفتح بشكل صحيح بالعربية في Excel */
export function toCsv(r: ReportResult, locale: "ar" | "en") {
  const esc = (s: string) => (/[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const neutralize = (s: string) => (/^[=+\-@\t\r]/.test(s) && !/^-?\d/.test(s) ? `'${s}` : s); // حماية من حقن الصيغ
  const lines: string[] = [];
  lines.push(esc(locale === "ar" ? r.titleAr : r.titleEn));
  lines.push(esc(`${locale === "ar" ? "تاريخ الاستخراج" : "Generated"}: ${r.generatedAt.toISOString()}`));
  lines.push(esc(`${locale === "ar" ? "الفلاتر" : "Filters"}: ${Object.entries(r.filters).map(([k, v]) => `${k}=${v}`).join("; ") || "-"}`));
  lines.push("");
  lines.push(r.columns.map((c) => esc(locale === "ar" ? c.ar : c.en)).join(","));
  for (const row of r.rows) lines.push(r.columns.map((c) => esc(neutralize(cellText(row[c.key], c.type)))).join(","));
  if (r.totals) lines.push(r.columns.map((c) => esc(neutralize(cellText(r.totals![c.key], c.type)))).join(","));
  return "﻿" + lines.join("\r\n");
}

export async function toXlsx(r: ReportResult, locale: "ar" | "en") {
  const wb = new ExcelJS.Workbook();
  wb.creator = "GSW Property ERP";
  wb.created = r.generatedAt;
  const ws = wb.addWorksheet((locale === "ar" ? r.titleAr : r.titleEn).slice(0, 31).replace(/[\\/?*[\]:]/g, " "), { views: [{ rightToLeft: locale === "ar" }] });
  ws.addRow([locale === "ar" ? r.titleAr : r.titleEn]).font = { bold: true, size: 14 };
  ws.addRow([`${locale === "ar" ? "تاريخ الاستخراج" : "Generated"}: ${r.generatedAt.toISOString()}`]);
  ws.addRow([`${locale === "ar" ? "الفلاتر" : "Filters"}: ${Object.entries(r.filters).map(([k, v]) => `${k}=${v}`).join("; ") || "-"}`]);
  ws.addRow([]);
  const header = ws.addRow(r.columns.map((c) => (locale === "ar" ? c.ar : c.en)));
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.eachCell((cell) => (cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B1F3A" } }));
  const toCell = (v: unknown, type?: string) => {
    if (v === null || v === undefined) return null;
    // المبالغ تُكتب كأرقام بثلاث منازل (القيمة مأخوذة من النص الدقيق)
    if (typeof v === "bigint") return Number(fromBaisa(v));
    if (type === "number" || type === "percent") return typeof v === "number" ? v : Number(v);
    return String(v);
  };
  for (const row of r.rows) ws.addRow(r.columns.map((c) => toCell(row[c.key], c.type)));
  if (r.totals) ws.addRow(r.columns.map((c) => toCell(r.totals![c.key], c.type))).font = { bold: true };
  r.columns.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    col.width = c.type === "money" ? 16 : c.type === "text" ? 28 : 14;
    if (c.type === "money") col.numFmt = "#,##0.000";
    if (c.type === "percent") col.numFmt = "0.00";
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}
