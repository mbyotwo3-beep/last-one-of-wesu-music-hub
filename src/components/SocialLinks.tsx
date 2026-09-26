import { ExternalLink, Facebook, Instagram, Music2, Youtube, type LucideIcon } from "lucide-react";
import { collectSocialLinks, type SocialLinkKey } from "@/lib/social-links";
import { isNativeShell, openExternalUrl } from "@/lib/external-url";

const socialIcons: Record<SocialLinkKey, LucideIcon> = {
  instagram: Instagram,
  twitter: ExternalLink,
  facebook: Facebook,
  youtube: Youtube,
  spotify: Music2,
  apple_music: Music2,
};

export function SocialLinks({ links }: { links: unknown }) {
  const entries = collectSocialLinks(links);
  if (!entries.length) return null;

  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Artist social links">
      {entries.map(({ key, label, url }) => {
        const Icon = socialIcons[key];
        return (
          <a
            key={key}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => {
              // WebView ignores target="_blank" (no tab support) — route
              // external links through the in-app browser sheet instead.
              if (isNativeShell()) {
                e.preventDefault();
                void openExternalUrl(url);
              }
            }}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
            aria-label={`${label} (opens in a new tab)`}
          >
            <Icon className="size-3.5" />
            {label}
          </a>
        );
      })}
    </div>
  );
}
