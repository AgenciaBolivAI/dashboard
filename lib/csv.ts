/**
 * CSV helpers shared by the export routes (and the import field-mapper).
 * RFC-4180 quoting: wrap a field in double quotes when it contains a comma,
 * quote, or newline, doubling any embedded quotes.
 */
export function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Build a CSV string from a header row + array-of-arrays of cell values. */
export function toCsv(header: string[], rows: unknown[][]): string {
  const lines = [header.map(csvEscape).join(",")];
  for (const r of rows) lines.push(r.map(csvEscape).join(","));
  return lines.join("\n");
}

/** A NextResponse-ready CSV download (set headers on the Response yourself). */
export function csvHeaders(filename: string): Record<string, string> {
  return {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${filename}"`,
  };
}
