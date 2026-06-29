// Localized opt-out copy. Plain module (no "server-only") so both the tick engine
// (footer/header text) and the PUBLIC /u/[token] landing page (outside the
// dashboard's next-intl provider) can import it. `{business}` in `prompt` is
// interpolated by the caller.
export type UnsubCopy = {
  label: string; // link / button text
  notice: string; // "To stop receiving these messages"
  title: string;
  prompt: string; // contains {business}
  confirm: string;
  done: string;
  invalid: string;
  processing: string;
};

export const UNSUB_COPY: Record<string, UnsubCopy> = {
  es: {
    label: "Cancelar suscripción",
    notice: "Para dejar de recibir estos mensajes",
    title: "Cancelar suscripción",
    prompt: "¿Dejar de recibir mensajes de marketing de {business}?",
    confirm: "Cancelar suscripción",
    done: "Listo. No recibirás más mensajes de marketing.",
    invalid: "Este enlace ya no es válido.",
    processing: "Procesando…",
  },
  en: {
    label: "Unsubscribe",
    notice: "To stop receiving these messages",
    title: "Unsubscribe",
    prompt: "Stop receiving marketing messages from {business}?",
    confirm: "Unsubscribe",
    done: "Done. You won't receive any more marketing messages.",
    invalid: "This link is no longer valid.",
    processing: "Processing…",
  },
  pt: {
    label: "Cancelar inscrição",
    notice: "Para parar de receber estas mensagens",
    title: "Cancelar inscrição",
    prompt: "Parar de receber mensagens de marketing de {business}?",
    confirm: "Cancelar inscrição",
    done: "Pronto. Você não receberá mais mensagens de marketing.",
    invalid: "Este link não é mais válido.",
    processing: "Processando…",
  },
  fr: {
    label: "Se désabonner",
    notice: "Pour ne plus recevoir ces messages",
    title: "Se désabonner",
    prompt: "Ne plus recevoir les messages marketing de {business} ?",
    confirm: "Se désabonner",
    done: "C'est fait. Vous ne recevrez plus de messages marketing.",
    invalid: "Ce lien n'est plus valide.",
    processing: "Traitement…",
  },
  it: {
    label: "Annulla iscrizione",
    notice: "Per non ricevere più questi messaggi",
    title: "Annulla iscrizione",
    prompt: "Smettere di ricevere messaggi di marketing da {business}?",
    confirm: "Annulla iscrizione",
    done: "Fatto. Non riceverai più messaggi di marketing.",
    invalid: "Questo link non è più valido.",
    processing: "Elaborazione…",
  },
};

export function unsubCopy(lang?: string | null): UnsubCopy {
  return UNSUB_COPY[(lang || "es").slice(0, 2).toLowerCase()] ?? UNSUB_COPY.es;
}
