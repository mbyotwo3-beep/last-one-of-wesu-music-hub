export type SocialLinkKey =
  | "instagram"
  | "twitter"
  | "facebook"
  | "youtube"
  | "spotify"
  | "apple_music";

export const SOCIAL_LINK_LABELS: Record<SocialLinkKey, string> = {
  instagram: "Instagram",
  twitter: "X (Twitter)",
  facebook: "Facebook",
  youtube: "YouTube",
  spotify: "Spotify",
  apple_music: "Apple Music",
};

const socialKeys = Object.keys(SOCIAL_LINK_LABELS) as SocialLinkKey[];

/**
 * Accept a full URL or a common pasted web address, while refusing
 * non-web protocols such as javascript: URLs.
 */
export function normalizeSocialUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  // A value with an explicit non-web scheme (for example mailto:, javascript:
  // or data:) must never be converted into a navigable profile link.
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) && !/^https?:/i.test(trimmed)) {
    return null;
  }

  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function collectSocialLinks(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const values = value as Record<string, unknown>;
  return socialKeys.flatMap((key) => {
    const url = normalizeSocialUrl(values[key]);
    return url ? [{ key, label: SOCIAL_LINK_LABELS[key], url }] : [];
  });
}
