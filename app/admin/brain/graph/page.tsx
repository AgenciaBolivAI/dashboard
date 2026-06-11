import Link from "next/link";
import { ArrowLeft, Brain } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireUser, requireBolivAIAdmin } from "@/lib/auth";
import { getGraph } from "@/lib/queries/brain-graph";
import { BrainGraph } from "@/components/admin/brain-graph";

export const dynamic = "force-dynamic";

export default async function BrainGraphPage() {
  await requireUser();
  await requireBolivAIAdmin();

  const data = await getGraph({ minMentions: 1 });

  return (
    <div className="p-6 md:p-8 max-w-[1400px]">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div>
          <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
            <Link href="/admin/brain">
              <ArrowLeft className="size-4" />
              Volver al brain
            </Link>
          </Button>
          <h1 className="text-3xl font-display font-extrabold tracking-tight flex items-center gap-2">
            <Brain className="size-7 text-primary" />
            Mapa del brain
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
            Cada nodo es una entidad — agente, tabla, vendor, workflow, decisión.
            Cada conexión es una relación extraída del corpus (usa, depende_de,
            escribe_en, etc.). Click en cualquier nodo para abrir su página de
            detalle. Filtra por tipo en el panel izquierdo; busca por nombre para
            saltar directo.
          </p>
        </div>
      </div>

      <BrainGraph data={data} />
    </div>
  );
}
