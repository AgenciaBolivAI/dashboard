import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, Brain } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireUser, requireBolivAIAdmin } from "@/lib/auth";
import { getGraph } from "@/lib/queries/brain-graph";
import { BrainGraph } from "@/components/admin/brain-graph";

export const dynamic = "force-dynamic";

export default async function BrainGraphPage() {
  await requireUser();
  await requireBolivAIAdmin();

  const t = await getTranslations("admin_brain");
  const data = await getGraph({ minMentions: 1 });

  return (
    <div className="p-6 md:p-8 max-w-[1400px]">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div>
          <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
            <Link href="/admin/brain">
              <ArrowLeft className="size-4" />
              {t("back_to_brain")}
            </Link>
          </Button>
          <h1 className="text-3xl font-display font-extrabold tracking-tight flex items-center gap-2">
            <Brain className="size-7 text-primary" />
            {t("graph_title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
            {t("graph_intro")}
          </p>
        </div>
      </div>

      <BrainGraph data={data} />
    </div>
  );
}
