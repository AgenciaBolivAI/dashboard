"use client";

import { useActionState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  addManualChunkAction,
  updateChunkAction,
  type IngestState,
  type KnowledgeType,
} from "@/lib/actions/knowledge";
import type { AnyChunk, FaqChunk, PainChunk } from "@/lib/queries/knowledge";

const initial: IngestState = { error: null };

export function ChunkFormDialog({
  open,
  onClose,
  tenantId,
  type,
  chunk,
}: {
  open: boolean;
  onClose: () => void;
  tenantId: string;
  type: KnowledgeType;
  chunk: AnyChunk | null;
}) {
  const isEdit = !!chunk;
  const t = useTranslations("knowledge");
  const [state, action, pending] = useActionState(
    isEdit ? updateChunkAction : addManualChunkAction,
    initial,
  );

  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.success) {
      toast.success(isEdit ? t("chunk_updated_toast") : t("chunk_added_toast"));
      onClose();
    }
  }, [state, isEdit, onClose, t]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t("dialog_title_edit") : t("dialog_title_add")}
          </DialogTitle>
          <DialogDescription>
            {type === "documents"
              ? t("dialog_desc_documents")
              : t("dialog_desc_clinical")}
          </DialogDescription>
        </DialogHeader>

        <form action={action} className="space-y-4">
          <input type="hidden" name="tenant_id" value={tenantId} />
          <input type="hidden" name="type" value={type} />
          {chunk ? <input type="hidden" name="id" value={chunk.id} /> : null}

          <div className="space-y-2">
            <Label htmlFor="source">{t("field_source")}</Label>
            <Input
              id="source"
              name="source"
              defaultValue={chunk?.source ?? "manual"}
              placeholder="manual"
            />
          </div>

          {type === "documents" ? (
            <>
              <Field
                label={t("field_question")}
                name="question"
                defaultValue={(chunk as FaqChunk | null)?.question ?? ""}
                placeholder={t("field_question_placeholder")}
              />
              <FieldArea
                label={t("field_answer")}
                name="answer"
                defaultValue={(chunk as FaqChunk | null)?.answer ?? ""}
                placeholder={t("field_answer_placeholder")}
                rows={2}
              />
              <FieldArea
                label={t("field_response_template")}
                name="response_template"
                defaultValue={(chunk as FaqChunk | null)?.response_template ?? ""}
                placeholder={t("field_response_template_placeholder")}
                rows={2}
              />
            </>
          ) : (
            <>
              <Field
                label={t("field_symptom")}
                name="symptom"
                defaultValue={(chunk as PainChunk | null)?.symptom ?? ""}
                placeholder={t("field_symptom_placeholder")}
              />
              <FieldArea
                label={t("field_diagnosis")}
                name="diagnosis"
                defaultValue={(chunk as PainChunk | null)?.diagnosis ?? ""}
                placeholder={t("field_diagnosis_placeholder")}
                rows={2}
              />
              <FieldArea
                label={t("field_recommendation")}
                name="recommendation"
                defaultValue={(chunk as PainChunk | null)?.recommendation ?? ""}
                placeholder={t("field_recommendation_placeholder")}
                rows={2}
              />
            </>
          )}

          <FieldArea
            label={t("field_content")}
            name="content"
            defaultValue={chunk?.content ?? ""}
            placeholder={t("field_content_placeholder")}
            rows={5}
            required
          />

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? t("saving") : isEdit ? t("save") : t("create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  ...rest
}: { label: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="space-y-2">
      <Label htmlFor={rest.name as string}>{label}</Label>
      <Input id={rest.name as string} {...rest} />
    </div>
  );
}

function FieldArea({
  label,
  rows = 3,
  ...rest
}: {
  label: string;
  rows?: number;
} & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <div className="space-y-2">
      <Label htmlFor={rest.name as string}>{label}</Label>
      <textarea
        id={rest.name as string}
        rows={rows}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        {...rest}
      />
    </div>
  );
}
