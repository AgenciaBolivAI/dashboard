/**
 * Curated ElevenLabs voices for BolivAI tenants.
 *
 * Each voice works with the eleven_turbo_v2_5 (multilingual) model so it
 * speaks any of: en, es, pt, fr, it, de + ~25 more. The descriptions are
 * in Spanish since most of our UI is Spanish; render them as-is.
 *
 * To swap or extend: add an entry, redeploy. We don't sync from
 * ElevenLabs at runtime — curation is intentional so tenants don't pick
 * a voice that sounds wrong for business use.
 */

export type CuratedVoice = {
  id: string;
  name: string;
  gender: "female" | "male";
  description: string;          // Spanish
  preview_url?: string;         // optional ElevenLabs preview clip
};

export const CURATED_VOICES: CuratedVoice[] = [
  // Female voices ──────────────────────────────────────────────────────
  {
    id: "21m00Tcm4TlvDq8ikWAM",
    name: "Rachel",
    gender: "female",
    description: "Cálida y profesional. Buena para servicio al cliente.",
  },
  {
    id: "EXAVITQu4vr4xnSDxMaL",
    name: "Sarah",
    gender: "female",
    description: "Joven, conversacional, animada.",
  },
  {
    id: "XB0fDUnXU5powFXDhCwa",
    name: "Charlotte",
    gender: "female",
    description: "Suave, paciente. Buena para citas médicas.",
  },
  {
    id: "AZnzlk1XvdvUeBnXmlld",
    name: "Domi",
    gender: "female",
    description: "Fuerte y directa. Buena para ventas.",
  },
  {
    id: "MF3mGyEYCl7XYWbV9V6O",
    name: "Elli",
    gender: "female",
    description: "Joven, expresiva, amigable.",
  },
  {
    id: "ThT5KcBeYPX3keUQqHPh",
    name: "Dorothy",
    gender: "female",
    description: "Madura, confiable. Buena para consultas legales o financieras.",
  },

  // Male voices ────────────────────────────────────────────────────────
  {
    id: "ErXwobaYiN019PkySvjV",
    name: "Antoni",
    gender: "male",
    description: "Neutro y profesional. Versátil.",
  },
  {
    id: "pNInz6obpgDQGcFmaJgB",
    name: "Adam",
    gender: "male",
    description: "Profundo y autoritario. Buen para B2B enterprise.",
  },
  {
    id: "TxGEqnHWrfWFTfGW9XjX",
    name: "Josh",
    gender: "male",
    description: "Joven, animado, energético.",
  },
  {
    id: "VR6AewLTigWG4xSOukaG",
    name: "Arnold",
    gender: "male",
    description: "Madura, segura. Buena para fitness o coaching.",
  },
  {
    id: "yoZ06aMxZJJ28mfd3POQ",
    name: "Sam",
    gender: "male",
    description: "Texturizada, directa. Conversacional sin sonar corporativa.",
  },
  {
    id: "ZQe5CZNOzWyzPSCn5a3c",
    name: "James",
    gender: "male",
    description: "Calmo, articulado. Buena para temas técnicos.",
  },
];

export function getVoiceById(id: string | null | undefined): CuratedVoice | null {
  if (!id) return null;
  return CURATED_VOICES.find((v) => v.id === id) ?? null;
}

export const DEFAULT_VOICE_ID = CURATED_VOICES[0].id;
