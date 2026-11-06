import { useState, useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, Play, Pause, ExternalLink } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { resolveImageUrl, peekImageUrl, invalidateImageUrl } from "@/lib/storage-url";
import { useIsNative, useIsMobile } from "@/hooks/use-platform";
import { sameOriginAppPath } from "@/lib/external-url";
import { toast } from "sonner";

export interface HeroSlide {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  /** Storage bucket the imageUrl path lives in. Defaults to "hero-images" for admin slides. */
  imageBucket?: "album-art" | "hero-images";
  videoUrl?: string;
  ctaText: string;
  ctaLink: string;
  ctaExternal?: boolean;
  /** Admin-chosen target: "_self" (same tab) or "_blank" (new tab / in-app). */
  ctaTarget?: string;
  gradient?: string;
}

export type HeroCtaMode = "spa" | "same-tab" | "new-tab" | "in-app";

/**
 * Pure routing decision for a hero CTA (unit-tested).
 * - Internal app paths always use SPA navigation on web; on native they
 *   stay in the WebView either way (no tabs exist).
 * - External links honor the admin's target on web (same tab vs new tab).
 * - External links on native ALWAYS open the in-app browser overlay
 *   (Facebook-Lite style): never strand the user in the system browser,
 *   regardless of the admin's tab choice.
 */
export function resolveHeroCta(args: {
  link: string;
  external: boolean;
  target?: string | null;
  isNative: boolean;
}): { mode: HeroCtaMode; url: string } {
  const url = args.link || "/";
  // FIRST: an absolute URL can still point at the app itself (admins paste
  // the full share link). Those are internal — SPA-navigate to their path on
  // web and in the native shell alike, never a browser.
  const selfPath = sameOriginAppPath(url);
  if (selfPath) return { mode: "spa", url: selfPath };
  const isExternal = args.external === true || /^https?:\/\//i.test(url) || !url.startsWith("/");
  if (!isExternal) return { mode: "spa", url };
  if (args.isNative) return { mode: "in-app", url };
  return { mode: args.target === "_blank" ? "new-tab" : "same-tab", url };
}

export type HeroLayout = "full-bleed" | "art-anchored";

/**
 * Pure layout decision for a hero slide (unit-tested).
 *
 * Admin slides usually ship as wide promotional banners (e.g. 820×320 ≈
 * 2.56:1) with the title and artwork baked into the RIGHT side of the image
 * and an empty dark gradient on the left. On desktop the hero box is 2.4:1,
 * so a center crop barely grazes the design. On mobile the hero box is 16:9
 * (1.78:1): a CENTER crop would cut ~30% of the width — slicing the baked
 * artwork mid-subject and the baked title in half.
 *
 * So on mobile a slide whose image is at least 1.9:1 is painted ANCHORED to
 * its art side ("right center"): the box is still filled edge to edge exactly
 * like desktop, the artwork and baked title survive intact, and only the
 * banner's empty left strip is cropped — the overlay text takes that space,
 * just as it does on desktop. Square artwork (the system hero's album art)
 * and desktop keep the plain centered cover.
 *
 * An unknown ratio (the image has not been measured yet, or the probe
 * failed) always returns "full-bleed": that is the plain cover, and it keeps
 * server-rendered and first-client-render markup identical (the ratio only
 * becomes known after hydration, when the image probe completes).
 */
export function resolveHeroLayout(args: {
  /** Natural image ratio (width / height). null when not yet measured. */
  ratio: number | null;
  isMobile: boolean;
}): HeroLayout {
  if (!args.isMobile) return "full-bleed";
  if (args.ratio === null || args.ratio <= 0) return "full-bleed";
  return args.ratio >= 1.9 ? "art-anchored" : "full-bleed";
}

interface HeroCarouselProps {
  slides: HeroSlide[];
}

export function HeroCarousel({ slides }: HeroCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [signedUrls, setSignedUrls] = useState<Map<string, string>>(() => {
    const map = new Map<string, string>();
    for (const slide of slides) {
      if (/^(https?:|data:|blob:)/i.test(slide.imageUrl)) {
        map.set(slide.id, slide.imageUrl);
      } else {
        const bucket = slide.imageBucket ?? "hero-images";
        const cached = peekImageUrl(bucket, slide.imageUrl);
        if (cached) map.set(slide.id, cached);
      }
    }
    return map;
  });
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const progressRef = useRef<NodeJS.Timeout | null>(null);
  // Native apps have no tabs: external "new tab" links open in-app instead.
  const isNative = useIsNative();
  // Mobile viewports stack wide admin banners instead of cropping them.
  const isMobile = useIsMobile();
  // Natural aspect ratio (width / height) per slide id, measured once the
  // signed URL is known. Decides the mobile background anchor.
  const [imageRatios, setImageRatios] = useState<Map<string, number>>(new Map());
  const ratioProbedRef = useRef<Map<string, string>>(new Map());

  // Only auto-rotate if there are 2 or more slides
  const shouldAutoRotate = slides.length >= 2;

  const nextSlide = () => {
    setCurrentIndex((prev) => (prev + 1) % slides.length);
    resetProgress();
  };

  const prevSlide = () => {
    setCurrentIndex((prev) => (prev - 1 + slides.length) % slides.length);
    resetProgress();
  };

  const goToSlide = (index: number) => {
    setCurrentIndex(index);
    resetProgress();
  };

  const togglePause = () => {
    setIsPaused(!isPaused);
  };

  const resetProgress = () => {
    setProgress(0);
  };

  // Auto-rotation timer (5 seconds)
  useEffect(() => {
    if (!shouldAutoRotate || isPaused) {
      if (timerRef.current) clearInterval(timerRef.current);
      if (progressRef.current) clearInterval(progressRef.current);
      return;
    }

    // Progress bar animation (updates every 100ms for smooth animation)
    progressRef.current = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          return 0;
        }
        return prev + 2; // 100 increments over 5 seconds
      });
    }, 100);

    // Slide transition timer
    timerRef.current = setInterval(() => {
      nextSlide();
    }, 5000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (progressRef.current) clearInterval(progressRef.current);
    };
  }, [shouldAutoRotate, isPaused, slides.length]);

  // Reset progress when slide changes
  useEffect(() => {
    resetProgress();
  }, [currentIndex]);

  // Resolve image URLs for all slides on mount — batched into one setState to
  // avoid multiple rapid re-renders that show up as flickering.
  useEffect(() => {
    let cancelled = false;

    const resolveAll = async () => {
      const entries = await Promise.all(
        slides.map(async (slide) => {
          // Already an absolute URL — use directly
          if (/^(https?:|data:|blob:)/i.test(slide.imageUrl)) {
            return [slide.id, slide.imageUrl] as const;
          }

          const bucket = slide.imageBucket ?? "hero-images";

          // Try the in-memory cache first (avoids a network round-trip)
          const cached = peekImageUrl(bucket, slide.imageUrl);
          if (cached) return [slide.id, cached] as const;

          try {
            const url = await resolveImageUrl(bucket, slide.imageUrl);
            return [slide.id, url || ""] as const;
          } catch (e) {
            console.error("Failed to resolve hero carousel image:", slide.imageUrl, e);
            return [slide.id, ""] as const;
          }
        }),
      );

      if (!cancelled) {
        setSignedUrls(new Map(entries.filter(([, url]) => !!url) as [string, string][]));
      }
    };

    resolveAll();

    return () => {
      cancelled = true;
    };
  }, [slides]);

  // Measure each slide image's natural aspect ratio once its URL is known.
  // Admin banners are often very wide (e.g. 820×320 ≈ 2.56:1); that ratio is
  // what decides the mobile background anchor (resolveHeroLayout). Probes
  // are deduped per slide+URL so re-renders and signed-URL refreshes never
  // re-measure an unchanged image.
  useEffect(() => {
    let cancelled = false;

    for (const slide of slides) {
      const url = signedUrls.get(slide.id) ?? "";
      if (!/^(https?:|data:|blob:)/i.test(url)) continue;
      if (ratioProbedRef.current.get(slide.id) === url) continue;
      ratioProbedRef.current.set(slide.id, url);

      const img = new Image();
      img.onload = () => {
        if (cancelled || img.naturalWidth <= 0 || img.naturalHeight <= 0) return;
        const ratio = img.naturalWidth / img.naturalHeight;
        setImageRatios((prev) => {
          const next = new Map(prev);
          next.set(slide.id, ratio);
          return next;
        });
      };
      img.src = url;
    }

    return () => {
      cancelled = true;
    };
  }, [signedUrls, slides]);

  if (slides.length === 0) return null;

  const currentSlide = slides[currentIndex];

  // Use the ctaExternal field to determine if link should open in new tab.
  // CMS links are free text — anything that isn't a plain internal path
  // ("/albums/...") falls back to <a> so a bad value can't crash the router.
  const ctaLink = currentSlide.ctaLink || "/";
  const cta = resolveHeroCta({
    link: ctaLink,
    external: currentSlide.ctaExternal === true,
    target: currentSlide.ctaTarget,
    isNative,
  });

  async function openInApp(url: string) {
    try {
      const { Browser } = await import("@capacitor/browser");
      await Browser.open({ url });
    } catch {
      toast.error("Couldn't open the link");
    }
  }

  const currentRatio = imageRatios.get(currentSlide.id) ?? null;

  // Where the background anchors. Wide admin banners keep their artwork side
  // (see resolveHeroLayout); everything else centers as it always has.
  const layout = resolveHeroLayout({ ratio: currentRatio, isMobile });
  const bgPosition = layout === "art-anchored" ? "right center" : "center";

  // Cross-fading slide layers. Both layouts carry the left gradient: the
  // overlay text sits over it, on mobile and desktop alike.
  const renderLayers = () => (
    <>
      {slides.map((slide, idx) => {
        const isCurrent = idx === currentIndex;
        // Only absolute URLs (signed, external) may be painted. A raw
        // storage path in background-image resolves against the SITE root
        // and 404s on every page load; until the signed URL arrives the
        // deterministic placeholder shows instead.
        const signedUrl = signedUrls.get(slide.id) ?? "";
        const paintable = /^(https?:|data:|blob:)/i.test(signedUrl);
        return (
          <div
            key={slide.id}
            className={`absolute inset-0 transition-opacity duration-700 ease-in-out ${
              isCurrent ? "opacity-100 z-0" : "opacity-0 -z-10 pointer-events-none"
            }`}
          >
            {slide.videoUrl && isCurrent ? (
              <div className="relative w-full h-full">
                <iframe
                  src={slide.videoUrl}
                  className="absolute inset-0 w-full h-full object-cover"
                  title={slide.title}
                  allow="autoplay; encrypted-media"
                  allowFullScreen
                  style={{ pointerEvents: "none" }}
                />
                <div className="absolute inset-0 bg-black/60" />
              </div>
            ) : (
              <div
                className="absolute inset-0"
                style={
                  paintable
                    ? {
                        backgroundImage: `url(${signedUrl})`,
                        backgroundSize: "cover",
                        backgroundPosition: bgPosition,
                      }
                    : undefined
                }
              >
                <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/50 to-transparent" />
              </div>
            )}
          </div>
        );
      })}
    </>
  );

  const renderCta = () => {
    if (cta.mode === "spa") {
      return (
        <Link
          to={cta.url as any}
          className="inline-flex items-center gap-2 px-6 py-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded-full text-sm md:text-base font-semibold transition-all duration-200 hover:scale-105 active:scale-95"
        >
          {currentSlide.ctaText}
          <Play className="size-4 fill-primary-foreground" />
        </Link>
      );
    }
    if (cta.mode === "in-app") {
      return (
        <button
          type="button"
          onClick={() => void openInApp(cta.url)}
          className="inline-flex items-center gap-2 px-6 py-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded-full text-sm md:text-base font-semibold transition-all duration-200 hover:scale-105 active:scale-95"
        >
          {currentSlide.ctaText}
          <ExternalLink className="size-4" />
        </button>
      );
    }
    return (
      <a
        href={cta.url}
        {...(cta.mode === "new-tab" ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        className="inline-flex items-center gap-2 px-6 py-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded-full text-sm md:text-base font-semibold transition-all duration-200 hover:scale-105 active:scale-95"
      >
        {currentSlide.ctaText}
        <ExternalLink className="size-4" />
      </a>
    );
  };

  const renderArrows = () => (
    <>
      <button
        onClick={prevSlide}
        className="hidden sm:flex absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-black/50 backdrop-blur-md border border-white/20 items-center justify-center text-white hover:bg-black/70 transition-colors"
        aria-label="Previous slide"
      >
        <ChevronLeft className="size-6" />
      </button>
      <button
        onClick={nextSlide}
        className="hidden sm:flex absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-black/50 backdrop-blur-md border border-white/20 items-center justify-center text-white hover:bg-black/70 transition-colors"
        aria-label="Next slide"
      >
        <ChevronRight className="size-6" />
      </button>
    </>
  );

  const renderPauseButton = () =>
    shouldAutoRotate ? (
      <button
        onClick={togglePause}
        className="absolute top-4 right-4 w-10 h-10 rounded-full bg-black/50 backdrop-blur-md border border-white/20 items-center justify-center text-white hover:bg-black/70 transition-colors"
        aria-label={isPaused ? "Play slideshow" : "Pause slideshow"}
        title={isPaused ? "Play slideshow" : "Pause slideshow"}
      >
        {isPaused ? <Play className="size-4 fill-current" /> : <Pause className="size-4" />}
      </button>
    ) : null;

  const renderProgress = () =>
    shouldAutoRotate ? (
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
        <div
          className="h-full bg-primary transition-all duration-100 ease-linear"
          style={{ width: `${progress}%` }}
        />
      </div>
    ) : null;

  const renderDots = () => (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
      {slides.map((_, index) => (
        <button
          key={index}
          onClick={() => goToSlide(index)}
          className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
            index === currentIndex ? "bg-white w-8" : "bg-white/40 hover:bg-white/60"
          }`}
          aria-label={`Go to slide ${index + 1}`}
          aria-current={index === currentIndex ? "true" : "false"}
        />
      ))}
    </div>
  );

  // FULL-BLEED LAYOUT — the one hero, desktop and mobile alike. Wide admin
  // banners on mobile anchor to their art side (bgPosition above) so the box
  // is filled edge to edge without slicing the baked artwork.
  return (
    <div
      className="relative w-full aspect-[16/9] md:aspect-[2.4/1] overflow-hidden rounded-2xl mb-8"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Background with video or image cross-fade */}
      <div className="absolute inset-0">{renderLayers()}</div>

      {/* Content */}
      <div className="absolute inset-0 flex items-center px-8 md:px-12 lg:px-16">
        <div className="max-w-2xl">
          <h2 className="text-2xl md:text-4xl lg:text-5xl font-bold text-white tracking-tight mb-3 md:mb-4">
            {currentSlide.title}
          </h2>
          <p className="text-sm md:text-lg lg:text-xl text-zinc-300 mb-6 md:mb-8 line-clamp-2">
            {currentSlide.description}
          </p>
          {renderCta()}
        </div>
      </div>

      {renderArrows()}
      {renderPauseButton()}
      {renderProgress()}
      {renderDots()}
    </div>
  );
}
