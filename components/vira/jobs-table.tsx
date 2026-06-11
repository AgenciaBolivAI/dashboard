import Link from "next/link";
import { Clock, Check, AlertCircle, Loader2, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ViraJob } from "@/lib/queries/vira";
import { cn } from "@/lib/utils";

const STATUS_META: Record<
  ViraJob["status"],
  { label: string; cls: string; icon: typeof Clock; spinning?: boolean }
> = {
  pending:      { label: "En cola",      cls: "bg-muted text-muted-foreground", icon: Clock },
  downloading:  { label: "Descargando",  cls: "bg-blue-500/15 text-blue-600 dark:text-blue-400", icon: Loader2, spinning: true },
  transcribing: { label: "Transcribiendo", cls: "bg-blue-500/15 text-blue-600 dark:text-blue-400", icon: Loader2, spinning: true },
  analyzing:    { label: "Analizando",   cls: "bg-purple-500/15 text-purple-600 dark:text-purple-400", icon: Loader2, spinning: true },
  clipping:     { label: "Cortando",     cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400", icon: Loader2, spinning: true },
  done:         { label: "Listo",        cls: "bg-primary/15 text-primary", icon: Check },
  failed:       { label: "Falló",        cls: "bg-destructive/15 text-destructive", icon: AlertCircle },
  cancelled:    { label: "Cancelado",    cls: "bg-muted text-muted-foreground", icon: X },
};

function shortenUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname}${u.pathname.length > 30 ? u.pathname.slice(0, 28) + "…" : u.pathname}`;
  } catch {
    return url.slice(0, 50);
  }
}

function fmtDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function JobsTable({
  jobs,
  tenantSlug,
}: {
  jobs: ViraJob[];
  tenantSlug: string;
}) {
  if (jobs.length === 0) {
    return (
      <Card className="py-12 text-center text-sm text-muted-foreground">
        Aún no procesaste ningún video. Pega un link arriba para empezar.
      </Card>
    );
  }

  return (
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Video</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="text-right">Duración</TableHead>
            <TableHead>Idioma</TableHead>
            <TableHead>Encolado</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {jobs.map((j) => {
            const meta = STATUS_META[j.status];
            const Icon = meta.icon;
            return (
              <TableRow key={j.id}>
                <TableCell>
                  <a
                    href={j.source_url}
                    target="_blank"
                    rel="noopener"
                    className="text-sm hover:underline"
                    title={j.source_url}
                  >
                    {shortenUrl(j.source_url)}
                  </a>
                  {j.source_type && (
                    <div className="text-xs text-muted-foreground capitalize">
                      {j.source_type.replace("_", " ")}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={cn("gap-1", meta.cls)}>
                    <Icon
                      className={cn("size-3", meta.spinning && "animate-spin")}
                    />
                    {meta.label}
                  </Badge>
                  {j.error && (
                    <div className="text-xs text-destructive mt-1 line-clamp-2 max-w-xs">
                      {j.error}
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-right text-xs font-mono">
                  {fmtDuration(j.duration_seconds)}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground uppercase">
                  {j.language ?? "—"}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {new Date(j.created_at).toLocaleString("es-BO", {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                </TableCell>
                <TableCell className="text-right">
                  {j.status === "done" ? (
                    <Link
                      href={`/dashboard/${tenantSlug}/shorts/${j.id}`}
                      className="text-xs text-primary hover:underline"
                    >
                      Ver clips →
                    </Link>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
}
