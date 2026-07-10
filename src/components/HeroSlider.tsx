import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, Play } from "lucide-react";
import { usePlayer } from "@/stores/player";

interface FeaturedSlide {
  id: string;
  title: string;
  subtitle: string;
  imageUrl: string;
  gradient: string;
  audioUrl?: string;
}

interface HeroSliderProps {
  slides: FeaturedSlide[];
}

export function HeroSlider({ slides }: HeroSliderProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const setTrack = usePlayer((s) => s.setTrack);

  const nextSlide = () => {
    setCurrentIndex((prev) => (prev + 1) % slides.length);
  };

  const prevSlide = () => {
    setCurrentIndex((prev) => (prev - 1 + slides.length) % slides.length);
  };

  // Auto‑advance timer (5 seconds)
  useEffect(() => {
    const timer = setInterval(() => {
      nextSlide();
    }, 5000);
    return () => clearInterval(timer);
  }, [slides.length]);

  const handlePlay = (slide: FeaturedSlide) => {
    setTrack({
      id: slide.id,
      title: slide.title,
      artistName: slide.subtitle,
      coverUrl: slide.imageUrl,
      audioUrl: slide.audioUrl,
    });
  };

  if (slides.length === 0) return null;

  const currentSlide = slides[currentIndex];

  return (
    <div className="relative w-full aspect-[16/10] sm:aspect-[16/9] md:aspect-[16/9] lg:aspect-[2.39/1] overflow-hidden rounded-2xl mb-8" onClick={() => handlePlay(currentSlide)} style={{ cursor: 'pointer' }}>
      {/* Slide */}
      <div
        key={currentIndex}
        className="absolute inset-0 transition-all duration-700 ease-in-out"
        style={{
          backgroundImage: `linear-gradient(to right, ${currentSlide.gradient}, transparent), url(${currentSlide.imageUrl})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/40 to-transparent" />
      </div>

      {/* Content */}
      <div className="absolute inset-0 flex items-center px-8 md:px-12 lg:px-16">
        <div className="max-w-2xl">
          <h2 className="text-xl sm:text-2xl md:text-4xl lg:text-5xl font-bold text-white tracking-tight mb-2 md:mb-3">
            {currentSlide.title}
          </h2>
          <p className="text-xs sm:text-sm md:text-lg lg:text-xl text-zinc-300 mb-4 md:mb-6">{currentSlide.subtitle}</p>
          <button
            onClick={() => handlePlay(currentSlide)}
            className="inline-flex items-center gap-1.5 px-4 py-2 sm:px-6 sm:py-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded-full text-xs sm:text-sm md:text-base font-semibold transition-all duration-200 hover:scale-105 active:scale-95"
          >
            <Play className="size-4 sm:size-5 fill-primary-foreground" />
            Play Now
          </button>
        </div>
      </div>

      {/* Navigation Arrows */}
      <button
        onClick={prevSlide}
        className="hidden sm:flex absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 backdrop-blur-md border border-white/20 items-center justify-center text-white hover:bg-black/70 transition-colors"
        aria-label="Previous slide"
      >
        <ChevronLeft className="size-5" />
      </button>
      <button
        onClick={nextSlide}
        className="hidden sm:flex absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 backdrop-blur-md border border-white/20 items-center justify-center text-white hover:bg-black/70 transition-colors"
        aria-label="Next slide"
      >
        <ChevronRight className="size-5" />
      </button>

      {/* Dots */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
        {slides.map((_, index) => (
          <button
            key={index}
            onClick={() => setCurrentIndex(index)}
            className={`w-2 h-2 rounded-full transition-all duration-300 ${
              index === currentIndex ? "bg-white w-6" : "bg-white/40 hover:bg-white/60"
            }`}
            aria-label={`Go to slide ${index + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
