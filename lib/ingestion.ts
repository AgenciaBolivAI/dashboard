import "server-only";
import { createHash } from "node:crypto";
import OpenAI from "openai";

/**
 * Extracts plain text from a user-uploaded file. Supported types:
 *   - text/plain, text/markdown        — read as UTF-8
 *   - application/pdf                  — pdf-parse
 *   - application/.../wordprocessingml — mammoth (DOCX)
 *
 * Throws if the type isn't supported. Run from a Server Action only.
 */
export async function extractText(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const type = file.type;

  if (type === "application/pdf") {
    // pdf-parse pulls in a test fixture path on top-level import; importing
    // the inner module sidesteps that.
    const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default as (
      data: Buffer,
    ) => Promise<{ text: string }>;
    const data = await pdfParse(buffer);
    return data.text ?? "";
  }

  if (
    type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return result.value ?? "";
  }

  if (
    type === "text/plain" ||
    type === "text/markdown" ||
    type === "" ||
    type === "application/octet-stream"
  ) {
    return buffer.toString("utf-8");
  }

  throw new Error(`Tipo de archivo no soportado: ${type || "desconocido"}`);
}

/**
 * Stable hash of the extracted text — used by record_manager to detect
 * re-uploads of the same source.
 */
export function hashContent(content: string): string {
  return createHash("sha256").update(content.trim()).digest("hex");
}

/**
 * One chunk + the section it came from. We attach `section` so the dashboard
 * can show a real title in the table (instead of "(sin título)") and so each
 * chunk's embedding includes the section header for better retrieval context.
 */
export type Chunk = {
  /** Full text used for embedding — section header prefixed when present */
  content: string;
  /** The `## Section Header` this paragraph lived under, if any */
  section: string | null;
};

/**
 * Markdown-aware chunker.
 *
 *   - Treats `## Section` headers as hard boundaries (never merge across)
 *   - Prefixes each chunk's content with `## Section Header\n\n` so the
 *     embedding has topic context
 *   - Within a section, packs paragraphs up to ~600 chars; long paragraphs
 *     split at sentence boundaries
 *   - Drops `# Doc Title` h1 (document-level header isn't useful per chunk)
 */
export function chunkText(
  text: string,
  target = 600,
  max = 1500,
): Chunk[] {
  type Section = { header: string | null; paragraphs: string[] };

  const sections: Section[] = [{ header: null, paragraphs: [] }];
  let buffer = "";

  const flushParagraph = () => {
    if (buffer.trim()) {
      sections[sections.length - 1].paragraphs.push(buffer.trim());
    }
    buffer = "";
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    const h2 = /^##\s+(.+)$/.exec(line);
    const h1 = /^#\s+(.+)$/.exec(line);

    if (h2) {
      flushParagraph();
      sections.push({ header: h2[1].trim(), paragraphs: [] });
      continue;
    }
    if (h1) {
      // document title — flush buffer but don't open a section
      flushParagraph();
      continue;
    }
    if (line === "") {
      flushParagraph();
      continue;
    }
    buffer += (buffer ? "\n" : "") + line;
  }
  flushParagraph();

  const chunks: Chunk[] = [];

  for (const section of sections) {
    const prefix = section.header ? `## ${section.header}\n\n` : "";
    const wrap = (s: string): Chunk => ({
      content: (prefix + s.trim()).trim(),
      section: section.header,
    });

    let current = "";

    for (const p of section.paragraphs) {
      if (p.length > max) {
        if (current.trim()) chunks.push(wrap(current));
        current = "";
        const sentences = p.match(/[^.!?\n]+[.!?]+(?:\s|$)|[^.!?\n]+$/g) ?? [p];
        let sub = "";
        for (const s of sentences) {
          if ((sub + s).length > target && sub) {
            chunks.push(wrap(sub));
            sub = s;
          } else {
            sub += s;
          }
        }
        if (sub.trim()) chunks.push(wrap(sub));
        continue;
      }
      if (!current) {
        current = p;
      } else if (current.length + p.length + 2 < target) {
        current = current + "\n\n" + p;
      } else {
        chunks.push(wrap(current));
        current = p;
      }
    }
    if (current.trim()) chunks.push(wrap(current));
  }

  return chunks;
}

/**
 * Calls OpenAI text-embedding-3-small (1536 dims). Batches in groups of 96
 * because we may have hundreds of chunks per upload.
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  const out: number[][] = [];

  for (let i = 0; i < texts.length; i += 96) {
    const batch = texts.slice(i, i + 96);
    const result = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: batch,
    });
    for (const d of result.data) out.push(d.embedding);
  }

  return out;
}
