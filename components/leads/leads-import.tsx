"use client";

import { useState, useTransition } from "react";
import { Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  importLeadsAction,
  IMPORTABLE_LEAD_FIELDS,
  type ImportableLeadField,
} from "@/lib/actions/leads";

const IGNORE = "__ignore__";

/**
 * Minimal RFC-4180 CSV parser (no dependency): handles quoted fields, escaped
 * quotes, and commas/newlines inside quotes. Returns trimmed headers + the
 * non-empty data rows.
 */
function parseCsv(text: string): { headers: string[]; dataRows: string[][] } {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      cur.push(field);
      field = "";
    } else if (c === "\n") {
      cur.push(field);
      rows.push(cur);
      cur = [];
      field = "";
    } else if (c !== "\r") field += c;
  }
  if (field.length > 0 || cur.length > 0) {
    cur.push(field);
    rows.push(cur);
  }
  const headers = (rows.shift() ?? []).map((h) => h.trim());
  const dataRows = rows.filter((r) => r.some((c) => c.trim() !== ""));
  return { headers, dataRows };
}

/** Guess which CSV column maps to a field by normalized-name match. */
function guessColumn(field: string, headers: string[]): string {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const aliases: Record<string, string[]> = {
    name: ["name", "fullname", "nombre", "contact", "cliente"],
    whatsapp_number: ["whatsapp", "phone", "telefono", "tel", "mobile", "celular", "number"],
    email: ["email", "correo", "mail", "e-mail"],
    intent: ["intent", "interest", "interes"],
    notes: ["notes", "note", "nota", "comments", "comentarios"],
    status: ["status", "estado"],
    source: ["source", "origen", "fuente"],
    vertical: ["vertical", "industry", "industria", "category", "rubro"],
    city: ["city", "ciudad", "town"],
    website: ["website", "web", "site", "sitio", "url"],
    address: ["address", "direccion", "domicilio"],
  };
  const targets = aliases[field] ?? [field];
  const found = headers.find((h) => targets.some((a) => norm(h) === norm(a)));
  if (found) return found;
  const partial = headers.find((h) => targets.some((a) => norm(h).includes(norm(a))));
  return partial ?? IGNORE;
}

export function LeadsImport({ tenantId }: { tenantId: string }) {
  const t = useTranslations("leads");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [fileName, setFileName] = useState("");
  const [pending, startTransition] = useTransition();

  function reset() {
    setHeaders([]);
    setRows([]);
    setMapping({});
    setFileName("");
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const text = await file.text();
    const parsed = parseCsv(text);
    setHeaders(parsed.headers);
    setRows(parsed.dataRows);
    // Auto-guess a sensible default mapping.
    const next: Record<string, string> = {};
    for (const f of IMPORTABLE_LEAD_FIELDS) next[f] = guessColumn(f, parsed.headers);
    setMapping(next);
  }

  function submit() {
    if (rows.length === 0) {
      toast.error(t("import_no_file"));
      return;
    }
    const idx: Partial<Record<ImportableLeadField, number>> = {};
    for (const f of IMPORTABLE_LEAD_FIELDS) {
      const col = mapping[f];
      if (col && col !== IGNORE) idx[f] = headers.indexOf(col);
    }
    const mapped = rows.map((r) => {
      const obj: Partial<Record<ImportableLeadField, string>> = {};
      for (const f of IMPORTABLE_LEAD_FIELDS) {
        const i = idx[f];
        if (i !== undefined && i >= 0) obj[f] = (r[i] ?? "").trim();
      }
      return obj;
    });

    startTransition(async () => {
      const res = await importLeadsAction(tenantId, mapped);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(t("import_success", { inserted: res.inserted, skipped: res.skipped }));
      setOpen(false);
      reset();
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Upload className="size-4" />
          {t("import_csv")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("import_title")}</DialogTitle>
          <DialogDescription>{t("import_description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <label className="flex items-center justify-center gap-2 border border-dashed border-border rounded-lg py-6 cursor-pointer hover:border-primary hover:bg-secondary/40 transition text-sm">
            <Upload className="size-4 text-muted-foreground" />
            <span>{fileName || t("import_choose_file")}</span>
            <input type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} />
          </label>

          {headers.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                {t("import_map_columns")}
              </p>
              <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1">
                {IMPORTABLE_LEAD_FIELDS.map((f) => (
                  <div key={f} className="flex items-center gap-2 text-sm">
                    <span className="w-32 shrink-0 text-muted-foreground">{t(`import_field_${f}`)}</span>
                    <select
                      value={mapping[f] ?? IGNORE}
                      onChange={(e) => setMapping((m) => ({ ...m, [f]: e.target.value }))}
                      className="flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                    >
                      <option value={IGNORE}>{t("import_ignore")}</option>
                      {headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {t("import_preview", { count: rows.length })}
              </p>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            {t("import_cancel")}
          </Button>
          <Button onClick={submit} disabled={pending || rows.length === 0}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            {t("import_submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
