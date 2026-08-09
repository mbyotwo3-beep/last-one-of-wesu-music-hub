import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Carousel } from "@/lib/carousel.functions";

interface Props {
  carousel: Carousel;
}

/**
 * CarouselShelf — horizontal swipeable card row rendered on the homepage.
 * Looks like Spotify / Apple Music section rows with image cards + title + link.
 */
export function CarouselShelf({ carousel }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  function scroll(dir: "left" | "right") {
    if (!scrollRef.current) return;
    const amount = scrollRef.current.clientWidth * 0.75;
    scrollRef.current.scrollBy({ left: dir === "left" ? -amount : amount, behavior: "smooth" });
  }

  if (!carousel.items || carousel.items.length === 0) return null;

  return (
    <section className="mb-10">
      {/* Header row */}
      <div className="flex items-center justify-between mb-4 px-2">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{carousel.title}</h2>
          {carousel.subtitle && (
            <p className="text-sm text-muted-foreground mt-0.5">{carousel.subtitle}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Arrow buttons (desktop only) */}
          <button
            onClick={() => scroll("left")}
            aria-label="Scroll left"
            className="hidden md:flex p-1.5 rounded-full bg-card border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            onClick={() => scroll("right")}
            aria-label="Scroll right"
            className="hidden md:flex p-1.5 rounded-full bg-card border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <ChevronRight className="size-4" />
          </button>
          {carousel.show_all_link && (
            <a
              href={carousel.show_all_link}
              className="text-sm text-primary hover:text-primary/80 font-medium transition-colors"
            >
              See All
            </a>
          )}
        </div>
      </div>

      {/* Scrollable card row */}
      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto pb-3 px-2 scrollbar-hide snap-x snap-mandatory"
        style={{ scrollSnapType: "x mandatory" }}
      >
        {carousel.items.map((item) => (
          <a
            key={item.id}
            href={item.link_url}
            className="group flex-none w-36 md:w-44 snap-start cursor-pointer"
            aria-label={item.title}
          >
            {/* Card image */}
            <div className="relative w-full aspect-square rounded-xl overflow-hidden bg-card ring-1 ring-white/5 mb-2.5 shadow-md group-hover:ring-primary/40 transition-all group-hover:scale-[1.03] duration-200">
              <img
                src={item.image_url}
                alt={item.title}
                className="w-full h-full object-cover"
                loading="lazy"
                onError={(e) => {
                  // fallback gradient on broken image
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
              {/* Play overlay on hover */}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center shadow-lg">
                  <svg
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    className="w-5 h-5 text-primary-foreground ml-0.5"
                  >
                    <path d="M5 3l14 9-14 9V3z" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Card text */}
            <p className="text-sm font-semibold truncate group-hover:text-primary transition-colors">
              {item.title}
            </p>
            {item.subtitle && (
              <p className="text-xs text-muted-foreground truncate mt-0.5">{item.subtitle}</p>
            )}
          </a>
        ))}
      </div>
    </section>
  );
}
