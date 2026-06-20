/**
 * Legal document references. Shared by the signup form (links), the signup
 * server action, and the OAuth callback (recording acceptance). Plain constants
 * — safe to import from both client and server.
 *
 * Bump TERMS_VERSION whenever the Terms or Privacy Policy materially change so
 * we can prove which version each user accepted (stored on the auth user's
 * user_metadata as { terms_accepted_at, terms_version }).
 */
export const TERMS_VERSION = "2026-06-19";

// The public legal pages live on the marketing site (bolivai.com), not the app.
export const TERMS_URL = "https://bolivai.com/terms.html";
export const PRIVACY_URL = "https://bolivai.com/privacy.html";
