"use client";

import { Copy } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function CopyField({ value }: { value: string }) {
  const t = useTranslations("settings_integrations");
  function copy() {
    navigator.clipboard.writeText(value);
    toast.success(t("copied"));
  }
  return (
    <div className="flex items-center gap-2">
      <Input value={value} readOnly className="font-mono text-xs" />
      <Button type="button" variant="outline" size="icon" onClick={copy}>
        <Copy className="size-4" />
      </Button>
    </div>
  );
}
