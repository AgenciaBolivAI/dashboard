import "server-only";
import sharp from "sharp";
import { createServiceClient } from "@/lib/supabase/service";
import { postToPage, postToInstagram } from "@/lib/meta";
import { uploadCcavaiImage } from "@/lib/content/ccavai-storage";

export type PublishTarget = "facebook" | "instagram";

/**
 * Publish a CCAVAI draft natively to the tenant's connected Facebook Page or
 * Instagram account. Shared by the dashboard "Publish" button and the n8n
 * auto-post endpoint. Reads the draft's REAL Storage image URL (not the
 * API-stream URL the UI uses), converts PNG→JPEG for Instagram (Meta requires
 * a public JPEG), publishes via the Graph API, and marks the draft `posted`.
 */
export async function publishDraft(input: {
  tenantId: string;
  draftId: string;
  target: PublishTarget;
}): Promise<{ ok: boolean; url?: string; error?: string }> {
  const svc = createServiceClient();

  const { data: draftRow } = await svc
    .from("ccavai_drafts")
    .select("draft_title, draft_body, draft_hashtags, image_url, status")
    .eq("id", input.draftId)
    .eq("tenant_id", input.tenantId)
    .maybeSingle();
  const draft = draftRow as {
    draft_title: string | null;
    draft_body: string;
    draft_hashtags: string[] | null;
    image_url: string | null;
    status: string;
  } | null;
  if (!draft) return { ok: false, error: "Draft not found" };

  // Some CCAVAI generations emit the hashtags BOTH inside draft_body and in the
  // draft_hashtags array. Appending the array again duplicates them in the
  // published post — only append tags that aren't already present in the body.
  const bodyText = draft.draft_body ?? "";
  const extraTags = (draft.draft_hashtags ?? []).filter(
    (h) => !new RegExp(`(^|\\s)${escapeRegExp(h)}(\\s|$)`, "i").test(bodyText),
  );
  const caption = [draft.draft_title, bodyText, extraTags.join(" ")]
    .filter(Boolean)
    .join("\n\n")
    .trim();

  // Resolve the connected channel + Page token. FB posts go to the Page id
  // (stored as the facebook_messenger channel); IG posts to the ig id.
  const channelKey = input.target === "facebook" ? "facebook_messenger" : "instagram";
  const { data: chRow } = await svc
    .from("tenant_channels")
    .select("external_id, config, status")
    .eq("tenant_id", input.tenantId)
    .eq("channel", channelKey)
    .maybeSingle();
  const ch = chRow as { external_id: string; config: Record<string, unknown>; status: string } | null;
  if (!ch || ch.status !== "active") return { ok: false, error: `${input.target}_not_connected` };
  const pageToken = ch.config?.page_access_token as string | undefined;
  if (!pageToken) return { ok: false, error: "missing_token" };

  try {
    let result: { id: string; url: string };
    if (input.target === "facebook") {
      result = await postToPage({
        pageId: ch.external_id,
        pageToken,
        message: caption,
        imageUrl: draft.image_url,
      });
    } else {
      if (!draft.image_url) return { ok: false, error: "instagram_needs_image" };
      const jpegUrl = await toJpegPublicUrl(input.tenantId, draft.image_url);
      result = await postToInstagram({
        igId: ch.external_id,
        pageToken,
        imageUrl: jpegUrl,
        caption,
      });
    }

    await svc
      .from("ccavai_drafts")
      .update({ status: "posted", decided_at: new Date().toISOString(), posted_url: result.url })
      .eq("id", input.draftId)
      .eq("tenant_id", input.tenantId);

    return { ok: true, url: result.url };
  } catch (e) {
    const raw = e instanceof Error ? e.message : "publish_failed";
    // The connect token only carries the publishing scopes when
    // META_ENABLE_PUBLISHING is on AND the tenant reconnected. Until then Meta
    // returns code 10 / "Requires <perm> permission" — surface a clean code so
    // the UI explains it instead of dumping the raw Graph error.
    if (/content_publish permission|pages_manage_posts|\(#10\)|\bcode\\?":?\s*10\b|requires .* permission/i.test(raw)) {
      return { ok: false, error: "needs_publish_permission" };
    }
    return { ok: false, error: raw.slice(0, 300) };
  }
}

/** Escape a string for safe use inside a RegExp (hashtags can contain no special
 * chars normally, but be defensive). */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Instagram requires a public JPEG; CCAVAI renders PNG, so convert + re-upload. */
async function toJpegPublicUrl(tenantId: string, srcUrl: string): Promise<string> {
  if (/\.jpe?g(\?|$)/i.test(srcUrl)) return srcUrl;
  const res = await fetch(srcUrl);
  if (!res.ok) throw new Error(`fetch image ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const jpeg = await sharp(buf).flatten({ background: "#ffffff" }).jpeg({ quality: 90 }).toBuffer();
  return uploadCcavaiImage(tenantId, "branded", jpeg, "image/jpeg");
}
