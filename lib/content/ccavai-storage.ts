import { randomUUID } from "crypto";
import { createServiceClient } from "@/lib/supabase/service";

const BUCKET = "ccavai";

/**
 * Upload a CCAVAI image to Supabase Storage and return its public URL.
 *
 * Images used to be stored as multi-MB base64 `data:` URIs inline in
 * ccavai_drafts.image_url — which bloated the DB to ~680MB and turned every
 * thumbnail render into ~3MB of Postgres egress. They now live in the public
 * `ccavai` bucket (CDN-cached, cacheable) and the column holds just the URL.
 */
export async function uploadCcavaiImage(
  tenantId: string,
  kind: "branded" | "subject",
  data: Buffer,
  contentType = "image/png",
): Promise<string> {
  const svc = createServiceClient();
  const ext = (contentType.split("/")[1] ?? "png").replace("jpeg", "jpg").replace("+xml", "");
  const path = `${tenantId}/${randomUUID()}-${kind}.${ext}`;
  const { error } = await svc.storage.from(BUCKET).upload(path, data, {
    contentType,
    upsert: true,
    // Immutable (UUID-named) — cache hard so the CDN serves repeat views
    // without an origin round-trip (keeps Storage egress near zero).
    cacheControl: "31536000",
  });
  if (error) throw new Error(`ccavai storage upload failed: ${error.message}`);
  const { data: pub } = svc.storage.from(BUCKET).getPublicUrl(path);
  return pub.publicUrl;
}

/** Decode a base64 `data:` image URI to bytes + content type (null if not one). */
export function decodeDataUri(
  value: string | null | undefined,
): { buf: Buffer; contentType: string } | null {
  if (!value) return null;
  const m = value.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
  if (!m) return null;
  return { buf: Buffer.from(m[2], "base64"), contentType: m[1] };
}
