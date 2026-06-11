"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Brain, Search, Loader2, FileText, Lightbulb, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  searchCompanyBrainAction,
  type BrainSearchHit,
  type BrainAnswerCitation,
} from "@/lib/actions/company-brain";
import { cn } from "@/lib/utils";

const SOURCE_BADGES: Record<string, { label: string; cls: string }> = {
  memory:        { label: "Memory",     cls: "bg-purple-500/15 text-purple-600 dark:text-purple-400" },
  platform_doc:  { label: "Platform doc", cls: "bg-blue-500/15 text-blue-600 dark:text-blue-400" },
  schema:        { label: "Schema",     cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  worker_doc:    { label: "Worker",     cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  workflow_meta: { label: "n8n",        cls: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400" },
  code_doc:      { label: "Code",       cls: "bg-slate-500/15 text-slate-600 dark:text-slate-400" },
  voice_call:    { label: "Voice",      cls: "bg-rose-500/15 text-rose-600 dark:text-rose-400" },
  manual:        { label: "Manual",     cls: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400" },
};

const EXAMPLE_QUERIES = [
  "¿Cómo funciona el modelo de créditos?",
  "¿Por qué elegimos Google Maps para AIMA en vez de Apollo?",
  "¿Qué tablas usa el sistema de billing?",
  "¿Cómo razona VIRA para elegir clips?",
  "¿Qué hace Rebecca cuando un agente se quedó sin créditos?",
];

/**
 * Convert citation markers like [1], [2] into clickable links pointing to
 * the cited doc/decision. We render the answer as text + interleaved Links
 * so the markdown-style citations actually work in-browser.
 */
function renderAnswerWithCitations(
  answer: string,
  citations: BrainAnswerCitation[],
): React.ReactNode[] {
  const citationMap = new Map<number, BrainAnswerCitation>();
  for (const c of citations) citationMap.set(c.index, c);

  // Split on [n] markers, keeping the marker text in the result so we can
  // replace it with a Link.
  const parts = answer.split(/(\[\d+\])/g);
  const nodes: React.ReactNode[] = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    const m = part.match(/^\[(\d+)\]$/);
    if (m) {
      const idx = parseInt(m[1]!, 10);
      const c = citationMap.get(idx);
      if (c) {
        const href = c.source === "doc" ? `/admin/brain/doc/${c.hit_id}` : `/admin/brain/decision/${c.hit_id}`;
        nodes.push(
          <Link
            key={`cit-${i}`}
            href={href}
            className="inline-flex items-center text-primary font-semibold hover:underline align-baseline text-[0.85em] px-0.5"
            title={c.title}
          >
            [{idx}]
          </Link>,
        );
        continue;
      }
    }
    nodes.push(<span key={`txt-${i}`}>{part}</span>);
  }
  return nodes;
}

export function BrainSearch() {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<BrainSearchHit[] | null>(null);
  const [answer, setAnswer] = useState<string | null>(null);
  const [citations, setCitations] = useState<BrainAnswerCitation[]>([]);
  const [pending, startSearch] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [totalMs, setTotalMs] = useState<number | null>(null);

  function go(q?: string) {
    const finalQuery = (q ?? query).trim();
    if (finalQuery.length < 2) return;
    if (q !== undefined) setQuery(q);
    startSearch(async () => {
      const res = await searchCompanyBrainAction(finalQuery, 8);
      if (res.error) {
        setError(res.error);
        setHits(null);
        setAnswer(null);
        setCitations([]);
        return;
      }
      setError(null);
      setHits(res.hits ?? []);
      setAnswer(res.answer ?? null);
      setCitations(res.citations ?? []);
      setTotalMs(res.total_ms ?? null);
    });
  }

  return (
    <div className="space-y-6">
      {/* Search box */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <Brain className="size-5 text-primary" />
          <p className="text-sm font-medium">
            Pregúntale al brain de la empresa
          </p>
        </div>

        <div className="flex gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="¿Cómo decidimos el costo de Apollo?"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                go();
              }
            }}
            disabled={pending}
            autoFocus
            className="flex-1"
          />
          <Button onClick={() => go()} disabled={pending || query.trim().length < 2}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
            Buscar
          </Button>
        </div>

        {!hits && !pending && (
          <div className="mt-4">
            <p className="text-xs text-muted-foreground mb-2">Ejemplos:</p>
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLE_QUERIES.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => go(q)}
                  className="text-xs px-2.5 py-1 rounded-full bg-secondary border border-border hover:border-primary/30 hover:text-foreground text-muted-foreground transition"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {totalMs !== null && hits && (
          <p className="text-xs text-muted-foreground mt-3">
            {hits.length} {hits.length === 1 ? "resultado" : "resultados"} en {totalMs}ms
            {answer && " · respuesta sintetizada"}
          </p>
        )}
        {error && (
          <p className="text-sm text-destructive mt-3">{error}</p>
        )}
      </Card>

      {/* Synthesized answer */}
      {answer && (
        <Card className="p-5 border-primary/30 bg-primary/5">
          <div className="flex items-start gap-3">
            <Brain className="size-5 text-primary shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs uppercase tracking-wider text-primary font-semibold mb-2">
                Respuesta del brain
              </p>
              <div className="text-sm leading-relaxed whitespace-pre-wrap">
                {renderAnswerWithCitations(answer, citations)}
              </div>
              {citations.length > 0 && (
                <div className="mt-4 pt-3 border-t border-primary/15">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
                    Fuentes citadas
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {citations.map((c) => {
                      const href =
                        c.source === "doc"
                          ? `/admin/brain/doc/${c.hit_id}`
                          : `/admin/brain/decision/${c.hit_id}`;
                      return (
                        <Link
                          key={c.hit_id}
                          href={href}
                          className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-md bg-background border border-border hover:border-primary/40 transition"
                        >
                          <span className="font-mono text-primary font-semibold">
                            [{c.index}]
                          </span>
                          <span className="truncate max-w-[260px]">{c.title}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* No-results state */}
      {hits !== null && hits.length === 0 && !pending && (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Sin resultados. Probá reformular la pregunta o registrar una decisión nueva.
        </Card>
      )}

      {/* Result cards — now clickable, route to /admin/brain/doc/[id] */}
      {hits && hits.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
            Fuentes ({hits.length})
          </p>
          {hits.map((hit) => {
            const badge = SOURCE_BADGES[
              (hit.metadata?.source_type as string) ?? hit.source
            ] ?? { label: hit.source, cls: "" };
            const isDecision = hit.source === "decision";
            const Icon = isDecision ? Lightbulb : FileText;
            const href = isDecision
              ? `/admin/brain/decision/${hit.id}`
              : `/admin/brain/doc/${hit.id}`;
            return (
              <Link
                key={`${hit.source}-${hit.id}`}
                href={href}
                className="block"
              >
                <Card className="p-5 hover:border-primary/30 hover:bg-secondary/30 transition cursor-pointer group">
                  <div className="flex items-start gap-3">
                    <Icon
                      className={cn(
                        "size-5 shrink-0 mt-0.5",
                        isDecision ? "text-amber-500" : "text-primary",
                      )}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className="font-semibold leading-tight group-hover:text-primary transition">
                          {hit.title}
                        </h3>
                        <Badge variant="outline" className={cn("text-[10px]", badge.cls)}>
                          {isDecision ? "Decisión" : badge.label}
                        </Badge>
                        <span className="text-xs text-muted-foreground font-mono">
                          {(Math.round(Number(hit.similarity) * 1000) / 10).toFixed(1)}%
                        </span>
                      </div>
                      {hit.source_path && (
                        <p className="text-xs text-muted-foreground font-mono mb-2 truncate">
                          {hit.source_path}
                        </p>
                      )}
                      {isDecision && Boolean(hit.metadata?.choice) && (
                        <p className="text-sm font-medium text-amber-600 dark:text-amber-400 mb-2">
                          Elegimos: {String(hit.metadata?.choice ?? "")}
                        </p>
                      )}
                      {hit.decided_at && (
                        <p className="text-xs text-muted-foreground mb-2">
                          Decidido: {new Date(hit.decided_at).toLocaleDateString("es-BO")}
                        </p>
                      )}
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-3 leading-relaxed">
                        {hit.content}
                      </p>
                    </div>
                    <ArrowRight className="size-4 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition" />
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
