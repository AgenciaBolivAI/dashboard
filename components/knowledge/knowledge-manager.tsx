"use client";

import { useRef, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Upload, Plus, Pencil, Trash2, FileText, Files } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { ChunkFormDialog } from "./chunk-form";
import {
  uploadKnowledgeAction,
  deleteChunkAction,
  deleteSourceAction,
  type KnowledgeType,
} from "@/lib/actions/knowledge";
import type {
  AnyChunk,
  FaqChunk,
  PainChunk,
  KnowledgeSource,
} from "@/lib/queries/knowledge";
import { formatRelative } from "@/lib/utils";

const ACCEPT_TYPES =
  ".txt,.md,.pdf,.docx,text/plain,text/markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export function KnowledgeManager({
  tenantId,
  type,
  chunks,
  sources,
}: {
  tenantId: string;
  type: KnowledgeType;
  chunks: AnyChunk[];
  sources: KnowledgeSource[];
}) {
  const t = useTranslations("knowledge");
  const locale = useLocale();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, startUpload] = useTransition();
  const [busy, startBusy] = useTransition();
  const [editing, setEditing] = useState<AnyChunk | null>(null);
  const [open, setOpen] = useState(false);

  function triggerUpload() {
    fileInput.current?.click();
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.set("tenant_id", tenantId);
    fd.set("type", type);
    fd.set("file", file);

    const id = toast.loading(
      t("upload_processing_toast", { name: file.name }),
    );

    startUpload(async () => {
      try {
        const res = await uploadKnowledgeAction(fd);
        if (res.error) {
          toast.error(res.error, { id });
        } else if (res.duplicateSkipped) {
          toast.warning(t("upload_duplicate_toast"), { id });
        } else {
          toast.success(
            t("upload_success_toast", { count: res.chunksAdded ?? 0, name: file.name }),
            { id },
          );
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t("upload_error_toast"), { id });
      } finally {
        if (fileInput.current) fileInput.current.value = "";
      }
    });
  }

  function openNew() {
    setEditing(null);
    setOpen(true);
  }

  function openEdit(c: AnyChunk) {
    setEditing(c);
    setOpen(true);
  }

  function handleDelete(c: AnyChunk) {
    if (!confirm(t("delete_chunk_confirm"))) return;
    startBusy(async () => {
      const res = await deleteChunkAction(tenantId, type, c.id);
      if (res.error) toast.error(res.error);
      else toast.success(t("chunk_deleted_toast"));
    });
  }

  function handleDeleteSource(source: string, chunkCount: number) {
    if (!confirm(t("delete_source_confirm", { source, count: chunkCount }))) return;
    startBusy(async () => {
      const res = await deleteSourceAction(tenantId, type, source);
      if (res.error) toast.error(res.error);
      else
        toast.success(t("source_deleted_toast", { count: chunkCount }));
    });
  }

  return (
    <>
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
        <p className="text-sm text-muted-foreground">
          {t("toolbar_counter", { chunks: chunks.length, sources: sources.length })}
        </p>
        <div className="flex gap-2">
          <input
            ref={fileInput}
            type="file"
            accept={ACCEPT_TYPES}
            className="hidden"
            onChange={handleFile}
          />
          <Button
            variant="outline"
            onClick={triggerUpload}
            disabled={uploading}
          >
            <Upload className="size-4" />
            {uploading ? t("uploading") : t("upload_file")}
          </Button>
          <Button onClick={openNew}>
            <Plus className="size-4" />
            {t("add_manually")}
          </Button>
        </div>
      </div>

      <div className="space-y-6">
        {/* Sources panel — driven by record_manager. Shows even if all
            chunks were deleted manually, so orphan sources can be cleaned. */}
        {sources.length > 0 ? (
          <Card id="sources" className="scroll-mt-20">
            <div className="border-b border-border px-4 py-3 flex items-center gap-2">
              <Files className="size-4 text-muted-foreground" />
              <p className="font-medium text-sm">{t("sources_title")}</p>
              <span className="text-xs text-muted-foreground ml-auto">
                {sources.length}
              </span>
            </div>
            <div className="divide-y divide-border">
              {sources.map((s) => (
                <div
                  key={s.source}
                  className="px-4 py-2.5 flex items-center justify-between"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{s.source}</p>
                    <p className="text-xs text-muted-foreground">
                      {s.chunk_count > 0 ? (
                        t("source_row_meta", {
                          count: s.chunk_count,
                          ago: formatRelative(s.ingested_at, locale),
                        })
                      ) : (
                        <span className="text-yellow-500">
                          {t("source_orphan")}
                        </span>
                      )}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-destructive shrink-0"
                    onClick={() => handleDeleteSource(s.source, s.chunk_count)}
                    disabled={busy}
                  >
                    <Trash2 className="size-4" />
                    {t("delete")}
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        ) : null}

        {chunks.length === 0 ? (
          <Card className="py-16 flex flex-col items-center text-center">
            <FileText className="size-10 text-muted-foreground mb-4" />
            <p className="font-medium">
              {type === "documents"
                ? t("empty_documents")
                : t("empty_clinical")}
            </p>
            <p className="text-sm text-muted-foreground mt-1 max-w-md">
              {t("empty_hint")}
            </p>
            <div className="mt-4 flex gap-2">
              <Button variant="outline" onClick={triggerUpload} disabled={uploading}>
                <Upload className="size-4" />
                {t("upload_file")}
              </Button>
              <Button onClick={openNew}>
                <Plus className="size-4" />
                {t("manual")}
              </Button>
            </div>
          </Card>
        ) : (
          /* Chunk table */
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-1/3">
                    {type === "documents" ? t("col_question_topic") : t("col_symptom_topic")}
                  </TableHead>
                  <TableHead>{t("col_content")}</TableHead>
                  <TableHead className="w-32">{t("col_source")}</TableHead>
                  <TableHead className="w-24">{t("col_added")}</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {chunks.map((c) => {
                  const heading =
                    type === "documents"
                      ? (c as FaqChunk).question
                      : (c as PainChunk).symptom;
                  return (
                    <TableRow key={`${type}-${c.id}`}>
                      <TableCell>
                        <p className="text-sm font-medium line-clamp-2">
                          {heading || (
                            <span className="italic text-muted-foreground">
                              {t("untitled")}
                            </span>
                          )}
                        </p>
                      </TableCell>
                      <TableCell>
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {c.content}
                        </p>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono text-[10px]">
                          {c.source ?? "manual"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatRelative(c.created_at, locale)}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEdit(c)}
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => handleDelete(c)}
                            disabled={busy}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>

      <ChunkFormDialog
        open={open}
        onClose={() => setOpen(false)}
        tenantId={tenantId}
        type={type}
        chunk={editing}
      />
    </>
  );
}
