/**
 * Registry of workflow templates and messaging gateways.
 *
 * Each "template" is a class of n8n workflow with a specific tool set
 * (booking, RAG, calendar sync, etc.). Each "gateway" is a messaging
 * provider (Evolution, Meta WhatsApp Cloud API, Twilio).
 *
 * Adding a new template = appending an entry here AND building the n8n
 * workflow JSON. Adding a new gateway = appending an entry here AND
 * adding the webhook + outbound HTTP nodes inside each template.
 */

export type GatewayId = "evolution" | "meta_whatsapp" | "twilio";
export type Status = "available" | "coming_soon";

export type ConfigField = {
  key: string;
  label: string;
  type: "text" | "password" | "url";
  placeholder?: string;
  required: boolean;
  description?: string;
};

export type Gateway = {
  id: GatewayId;
  name: string;
  short: string;
  description: string;
  status: Status;
  configFields: ConfigField[];
};

export type TemplateFeature = { id: string; label: string };

export type IntegrationProvider = "google";

export type WorkflowTemplate = {
  id: string;
  name: string;
  vertical: string;
  description: string;
  supportedGateways: GatewayId[];
  features: TemplateFeature[];
  promptTemplate: string;
  promptVariables: Record<string, string>;
  status: Status;
  /** Integrations the template needs (Google OAuth, etc.) */
  requiredIntegrations?: IntegrationProvider[];
};

// ─── Gateway registry ────────────────────────────────────────────────
export const GATEWAYS: Gateway[] = [
  {
    id: "evolution",
    name: "Evolution API",
    short: "Evolution",
    description:
      "WhatsApp gratuito vía Evolution. Ideal para desarrollo y clientes pequeños. Requiere escanear QR desde un teléfono.",
    status: "available",
    configFields: [
      {
        key: "instance",
        label: "Nombre de instancia",
        type: "text",
        placeholder: "evolution_hostinger",
        required: true,
        description: "El nombre que diste a la instancia en Evolution Manager.",
      },
    ],
  },
  {
    id: "meta_whatsapp",
    name: "WhatsApp Business API (Meta oficial)",
    short: "Meta",
    description:
      "API oficial de Meta. Más robusto y oficialmente soportado. Requiere verificación de Meta Business Manager.",
    status: "available",
    configFields: [
      {
        key: "phone_number_id",
        label: "Phone Number ID",
        type: "text",
        required: true,
        description: "ID del número en Meta Business → WhatsApp → API Setup.",
      },
      {
        key: "access_token",
        label: "Access Token (System User)",
        type: "password",
        required: true,
        description: "Token permanente generado para una System User con permisos de WhatsApp.",
      },
      {
        key: "verify_token",
        label: "Verify Token",
        type: "text",
        required: true,
        description: "Token que tú defines y pegas en la configuración del webhook.",
      },
    ],
  },
  {
    id: "twilio",
    name: "Twilio WhatsApp",
    short: "Twilio",
    description: "Pago por mensaje vía Twilio. Buena alternativa si ya usas Twilio.",
    status: "coming_soon",
    configFields: [
      { key: "account_sid", label: "Account SID", type: "text", required: true },
      { key: "auth_token", label: "Auth Token", type: "password", required: true },
      {
        key: "from",
        label: "WhatsApp From",
        type: "text",
        required: true,
        placeholder: "whatsapp:+14155238886",
      },
    ],
  },
];

// ─── Workflow templates ──────────────────────────────────────────────
const PHYSIO_PROMPT = `# Rol
Eres {{agent_name}}, recepcionista virtual de {{company_name}} ({{industry}}).
Tu misión es conversar con el cliente, agendar sesiones y resolver dudas.

# Personalidad
- Auténtica, cálida, con humor cuando encaje. Como un chat real de WhatsApp.
- Humilde: si no sabes algo, lo dices.

# Reglas generales
- Nunca menciones que eres una IA.
- Pregunta el nombre si no lo sabes todavía.
- Mantén respuestas cortas (máx 100 palabras).
- Responde siempre en {{language_variant}}.

# Herramientas disponibles
- search_slots_day → consulta horarios libres en una fecha
- book_slot → confirma una reserva (sólo cuando ya tienes slot_id, nombre y email)
- faq → busca información de precios, horarios, políticas
- problem → busca información sobre síntomas o dolencias
- capture_lead → guarda al cliente como lead potencial para seguimiento

# Flujo de reservas (orden estricto)
1. Si no sabes qué servicio quiere, pregúntalo.
2. Si no sabes qué día, pregúntale.
3. Llama search_slots_day con la fecha (formato YYYY-MM-DD). Muestra máximo 3 opciones.
4. Espera a que el cliente elija una hora específica.
5. Pídele su nombre completo si no lo tienes.
6. Pídele su email (obligatorio para confirmación).
7. SÓLO ENTONCES llama book_slot con todos los datos.
Nunca llames book_slot sin slot_id, customer_name y customer_email.

# Captura de leads
Si el cliente muestra interés (pregunta precios, pregunta por un servicio, pregunta
disponibilidad) PERO todavía no ha confirmado una reserva, llama a capture_lead UNA SOLA
vez en la conversación con:
- name: el nombre que te haya dado (o "Sin nombre" si no lo tienes)
- intent: "pricing_inquiry" si preguntó precios · "booking_consideration" si habló de
  reservar pero no concretó · "info_request" para cualquier otra duda
- notes: resumen breve de qué le interesó (ej: "Manicure semipermanente, preguntó por
  promo del lunes")

NO llames capture_lead si el cliente ya completó book_slot — esa reserva ya cuenta.
NO llames capture_lead más de una vez por conversación.

# Datos del cliente (memoria de largo plazo)
{{user_facts}}

# Hora actual
{{current_datetime}}`;

const REALESTATE_PROMPT = `# Rol
Eres {{agent_name}}, asesor inmobiliario virtual de {{company_name}}.
Tu misión es calificar leads, mostrar propiedades disponibles y agendar visitas.

# Personalidad
- Profesional pero cercana. Hablas como un asesor humano.
- Atenta a las necesidades reales del cliente: presupuesto, zona, urgencia.

# Reglas
- Nunca menciones que eres una IA.
- Tras 3-4 mensajes, captura: nombre, email, presupuesto, zona, urgencia.
- Mantén respuestas cortas (máx 120 palabras).
- Responde siempre en {{language_variant}}.
- Cuando agendes una visita, sincroniza con Google Calendar y envía email de confirmación.

# Datos del cliente
{{user_facts}}`;

const ECOMMERCE_PROMPT = `# Rol
Eres {{agent_name}}, asistente de {{company_name}}.
Atiendes consultas pre-venta, estado de pedidos y devoluciones.

# Reglas
- Nunca menciones que eres una IA.
- Para estado de pedido pide número o email del cliente.
- Mantén respuestas cortas (máx 100 palabras).
- Responde siempre en {{language_variant}}.`;

export const TEMPLATES: WorkflowTemplate[] = [
  {
    id: "physio",
    name: "Salud / Fisioterapia",
    vertical: "salud",
    description:
      "Recepcionista para clínicas y consultas. Agenda citas, responde precios y horarios, y hace un primer triaje de síntomas.",
    supportedGateways: ["evolution", "meta_whatsapp"],
    features: [
      { id: "booking", label: "Agenda citas" },
      { id: "rag_faq", label: "Responde FAQs" },
      { id: "rag_pain", label: "Triaje de síntomas" },
      { id: "hitl", label: "Toma de control humano" },
    ],
    promptTemplate: PHYSIO_PROMPT,
    promptVariables: {
      agent_name: "Eva",
      industry: "fisioterapia",
      language_variant: "español",
    },
    status: "available",
  },
  {
    id: "realestate",
    name: "Inmobiliaria",
    vertical: "real-estate",
    description:
      "Califica leads, muestra propiedades, agenda visitas. Sincroniza con Google Calendar y Sheets, manda emails de confirmación.",
    supportedGateways: ["evolution", "meta_whatsapp"],
    features: [
      { id: "lead_qualification", label: "Califica leads" },
      { id: "calendar_sync", label: "Google Calendar" },
      { id: "sheet_sync", label: "Google Sheets" },
      { id: "email_confirm", label: "Emails de confirmación" },
    ],
    promptTemplate: REALESTATE_PROMPT,
    promptVariables: {
      agent_name: "Eva",
      industry: "inmobiliaria",
      language_variant: "español",
    },
    status: "available",
    requiredIntegrations: ["google"],
  },
  {
    id: "ecommerce",
    name: "E-commerce / Tienda",
    vertical: "ecommerce",
    description:
      "Pre-venta, estado de pedidos, devoluciones. Conecta a tu sistema de pedidos vía API REST configurable.",
    supportedGateways: ["evolution", "meta_whatsapp"],
    features: [
      { id: "product_catalog", label: "Catálogo de productos" },
      { id: "order_status", label: "Estado de pedidos" },
      { id: "returns", label: "Gestión de devoluciones" },
      { id: "faq", label: "Políticas y FAQ" },
    ],
    promptTemplate: ECOMMERCE_PROMPT,
    promptVariables: {
      agent_name: "Eva",
      industry: "tienda",
      language_variant: "español",
    },
    status: "available",
  },
];

export function getTemplate(id: string): WorkflowTemplate {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0];
}

export function getGateway(id: string): Gateway {
  return GATEWAYS.find((g) => g.id === id) ?? GATEWAYS[0];
}
