"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Search, X, Layers, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { GraphPayload, GraphNode, GraphEdge } from "@/lib/queries/brain-graph";
import { cn } from "@/lib/utils";

// react-force-graph-2d uses window/document — must be client-only.
const ForceGraph2D = dynamic(() => import("react-force-graph-2d").then((m) => m.default), {
  ssr: false,
  loading: () => (
    <div className="h-[720px] flex items-center justify-center">
      <Loader2 className="size-8 animate-spin text-muted-foreground" />
    </div>
  ),
});

// Brand-ish palette per type. Tuned to be readable on a dark background.
const TYPE_COLORS: Record<string, string> = {
  agent:       "#00e5a0",  // BolivAI green
  vendor:      "#f97316",  // orange
  table:       "#3b82f6",  // blue
  workflow:    "#a855f7",  // purple
  integration: "#06b6d4",  // cyan
  tool:        "#94a3b8",  // slate
  concept:     "#f43f5e",  // rose
  project:     "#facc15",  // amber
  person:      "#ec4899",  // pink
  company:     "#84cc16",  // lime
  place:       "#22d3ee",  // light cyan
  task:        "#64748b",  // dim slate
  event:       "#c084fc",  // light purple
};
const DEFAULT_COLOR = "#888888";

const ALL_TYPES = Object.keys(TYPE_COLORS);

type GraphLink = GraphEdge & {
  // react-force-graph mutates source/target to hold the node ref after init.
  // We keep the originals as strings up-front; runtime is fine.
};

export function BrainGraph({ data }: { data: GraphPayload }) {
  const router = useRouter();
  const t = useTranslations("admin_brain");
  const containerRef = useRef<HTMLDivElement>(null);
  // Initialize types from the data so empty buckets are hidden by default
  const presentTypes = useMemo(() => {
    const s = new Set<string>();
    for (const n of data.nodes) s.add(n.type);
    return Array.from(s);
  }, [data.nodes]);

  const [enabledTypes, setEnabledTypes] = useState<Set<string>>(new Set(presentTypes));
  const [search, setSearch] = useState("");
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  // Window size — populated client-side
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    function measure() {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const h = Math.max(560, window.innerHeight - rect.top - 32);
      setSize({ w: rect.width, h });
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // Filter nodes by enabled types, edges by surviving endpoints
  const filtered = useMemo(() => {
    const nodeMap = new Map<string, GraphNode>();
    for (const n of data.nodes) {
      if (enabledTypes.has(n.type)) nodeMap.set(n.id, n);
    }
    const edges = data.edges.filter(
      (e) => nodeMap.has(e.source) && nodeMap.has(e.target),
    );
    return {
      nodes: Array.from(nodeMap.values()),
      links: edges as GraphLink[],
    };
  }, [data, enabledTypes]);

  // Searches highlight the first matching node by name
  useEffect(() => {
    if (!search.trim()) {
      setHighlightedId(null);
      return;
    }
    const lower = search.trim().toLowerCase();
    const hit = filtered.nodes.find((n) => n.name.toLowerCase().includes(lower));
    setHighlightedId(hit ? hit.id : null);
  }, [search, filtered.nodes]);

  function toggleType(type: string) {
    setEnabledTypes((cur) => {
      const next = new Set(cur);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  // Sizing function for nodes — sqrt of mention_count so heavy nodes don't
  // dominate everything, plus a tiny baseline so isolated nodes are clickable.
  function nodeRadius(node: GraphNode): number {
    return 3 + Math.sqrt(node.mention_count || 1) * 1.4;
  }

  // Per-frame custom render so we can paint labels selectively + color edges
  // by type. The library calls this on every animation frame at scale.
  function paintNode(node: GraphNode & { x?: number; y?: number }, ctx: CanvasRenderingContext2D, globalScale: number) {
    if (node.x == null || node.y == null) return;
    const r = nodeRadius(node);
    const color = TYPE_COLORS[node.type] ?? DEFAULT_COLOR;
    const isHighlighted = node.id === highlightedId;
    const isHovered = hoveredNode?.id === node.id;

    // Node disc
    ctx.beginPath();
    ctx.arc(node.x, node.y, r + (isHighlighted ? 4 : 0), 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();

    // Ring on hover/highlight
    if (isHighlighted || isHovered) {
      ctx.lineWidth = 2 / globalScale;
      ctx.strokeStyle = "#ffffff";
      ctx.stroke();
    }

    // Label — only show for higher-mention nodes OR hovered/highlighted
    const shouldLabel = (node.mention_count >= 8) || isHovered || isHighlighted;
    if (shouldLabel) {
      const fontSize = Math.max(10, Math.min(14, 11 / globalScale * 1.5));
      ctx.font = `${fontSize}px Inter, system-ui, sans-serif`;
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.textBaseline = "middle";
      ctx.fillText(node.name, node.x + r + 4, node.y);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4 mt-4">
      {/* Sidebar: filters + search + hover info */}
      <div className="space-y-3">
        <Card className="p-3">
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
            <Search className="size-3" />
            {t("graph_search_entity")}
          </p>
          <div className="relative">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="AIMA, OpenAI, credit_pricing…"
              className="pr-7 text-sm h-8"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={t("graph_clear")}
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
          {search.trim() && (
            <p className="text-xs mt-2">
              {highlightedId
                ? t("graph_highlighted", {
                    name: filtered.nodes.find((n) => n.id === highlightedId)?.name ?? "",
                  })
                : (
                  <span className="text-muted-foreground italic">{t("graph_no_matches")}</span>
                )}
            </p>
          )}
        </Card>

        <Card className="p-3">
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
            <Layers className="size-3" />
            {t("graph_filter_by_type")}
          </p>
          <div className="space-y-1">
            {ALL_TYPES.map((type) => {
              if (!presentTypes.includes(type)) return null;
              const on = enabledTypes.has(type);
              const count = data.nodes.filter((n) => n.type === type).length;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => toggleType(type)}
                  className={cn(
                    "w-full flex items-center justify-between gap-2 px-2 py-1 rounded text-xs transition",
                    on ? "bg-secondary" : "opacity-50 hover:opacity-100",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span
                      className="size-2.5 rounded-full"
                      style={{ background: TYPE_COLORS[type] ?? DEFAULT_COLOR }}
                    />
                    <span>{type}</span>
                  </span>
                  <span className="font-mono text-muted-foreground">{count}</span>
                </button>
              );
            })}
          </div>
        </Card>

        {/* Hover panel */}
        {hoveredNode && (
          <Card className="p-3 border-primary/30">
            <Badge
              variant="outline"
              className="text-[10px] mb-1"
              style={{
                borderColor: TYPE_COLORS[hoveredNode.type],
                color: TYPE_COLORS[hoveredNode.type],
              }}
            >
              {hoveredNode.type}
            </Badge>
            <p className="font-semibold text-sm">{hoveredNode.name}</p>
            {hoveredNode.summary && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-3">
                {hoveredNode.summary}
              </p>
            )}
            <p className="text-xs text-muted-foreground mt-2">
              {t("graph_mentioned", { count: hoveredNode.mention_count })}
            </p>
            <p className="text-xs text-primary mt-1">{t("graph_click_detail")}</p>
          </Card>
        )}

        <Card className="p-3 text-xs text-muted-foreground space-y-1">
          <p>{t.rich("graph_visible_entities", { count: filtered.nodes.length, strong: (c) => <strong className="text-foreground">{c}</strong> })}</p>
          <p>{t.rich("graph_relations", { count: filtered.links.length, strong: (c) => <strong className="text-foreground">{c}</strong> })}</p>
        </Card>
      </div>

      {/* Graph canvas */}
      <div ref={containerRef} className="rounded-lg border border-border bg-card overflow-hidden">
        {size ? (
          <ForceGraph2D
            graphData={{ nodes: filtered.nodes as object[], links: filtered.links as object[] }}
            width={size.w}
            height={size.h}
            backgroundColor="#0a0a0a"
            // Force tuning — faster cooldown so nodes settle quickly, then we
            // pin them so they stop drifting (see onEngineStop below).
            d3AlphaDecay={0.05}
            d3VelocityDecay={0.4}
            cooldownTicks={120}
            warmupTicks={15}
            // Once the simulation stops, pin every node in place by writing
            // fx/fy from the current x/y. This makes clicks reliable — nodes
            // no longer drift out from under the cursor.
            onEngineStop={() => {
              for (const n of filtered.nodes as Array<GraphNode & { x?: number; y?: number; fx?: number | null; fy?: number | null }>) {
                if (n.x != null && n.y != null && n.fx == null) {
                  n.fx = n.x;
                  n.fy = n.y;
                }
              }
            }}
            // Nodes
            nodeRelSize={4}
            nodeCanvasObject={paintNode as never}
            // Pointer-area painted larger than the visible disc so clicks at
            // the edge still register. Extra forgiveness = +6px on top of
            // the actual radius.
            nodePointerAreaPaint={(node: unknown, color: string, ctx: CanvasRenderingContext2D) => {
              const n = node as GraphNode & { x?: number; y?: number };
              if (n.x == null || n.y == null) return;
              ctx.fillStyle = color;
              ctx.beginPath();
              ctx.arc(n.x, n.y, nodeRadius(n) + 6, 0, 2 * Math.PI);
              ctx.fill();
            }}
            onNodeHover={(node: unknown) => setHoveredNode(node as GraphNode | null)}
            onNodeClick={(node: unknown) => {
              const n = node as GraphNode;
              router.push(`/admin/brain/entity/${n.id}`);
            }}
            // Dragging a node pins it in place (fx/fy auto-set by the engine).
            // The pin is permanent until the user drags it again.
            onNodeDragEnd={(node: unknown) => {
              const n = node as GraphNode & { x?: number; y?: number; fx?: number; fy?: number };
              if (n.x != null) n.fx = n.x;
              if (n.y != null) n.fy = n.y;
            }}
            // Edges
            linkColor={() => "rgba(255,255,255,0.10)"}
            linkWidth={(link: unknown) => Math.min(2, ((link as GraphEdge).weight ?? 1) * 0.5)}
            linkDirectionalArrowLength={3}
            linkDirectionalArrowRelPos={1}
            linkDirectionalArrowColor={() => "rgba(255,255,255,0.18)"}
          />
        ) : (
          <div className="h-[720px] flex items-center justify-center text-muted-foreground">
            <Loader2 className="size-8 animate-spin" />
          </div>
        )}
      </div>
    </div>
  );
}
