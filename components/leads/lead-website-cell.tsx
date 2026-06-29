"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Globe, Check, X } from "lucide-react";
import { toast } from "sonner";
import { updateLeadWebsiteAction } from "@/lib/actions/leads";

/**
 * Inline-editable website cell for the leads table. Shows the lead's website as
 * a link (or a "+ add website" affordance when empty) so the team can spot
 * prospects WITHOUT a site and upsell web development. Saves to the dedicated
 * `leads.website` column via updateLeadWebsiteAction.
 */
export function LeadWebsiteCell({
  tenantId,
  leadId,
  website,
}: {
  tenantId: string;
  leadId: string;
  website: string | null;
}) {
  const t = useTranslations("leads");
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(website ?? "");
  const [pending, start] = useTransition();

  function save() {
    const next = value.trim();
    if (next === (website ?? "")) {
      setEditing(false);
      return;
    }
    start(async () => {
      const res = await updateLeadWebsiteAction(tenantId, leadId, next);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(t("website_saved"));
      setEditing(false);
      router.refresh();
    });
  }

  function cancel() {
    setValue(website ?? "");
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          autoFocus
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") cancel();
          }}
          placeholder={t("website_placeholder")}
          disabled={pending}
          className="w-36 rounded-md border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="text-primary hover:opacity-80"
          title={t("website_save")}
        >
          <Check className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={cancel}
          className="text-muted-foreground hover:text-foreground"
          title={t("website_cancel")}
        >
          <X className="size-3.5" />
        </button>
      </div>
    );
  }

  return website ? (
    <div className="flex items-center gap-1.5">
      <a
        href={website}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs text-primary hover:underline truncate max-w-[150px]"
      >
        {website.replace(/^https?:\/\//, "")}
      </a>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-muted-foreground/60 hover:text-foreground shrink-0"
        title={t("website_edit")}
      >
        <Globe className="size-3" />
      </button>
    </div>
  ) : (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
    >
      <Globe className="size-3" /> {t("website_add")}
    </button>
  );
}
