import { useState, useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, Play, Pause, ExternalLink } from "lucide-react";
import { Link } from "@tanstack/react-router";

export interface HeroSlide {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  videoUrl?: string;
  ctaText: string;
  ctaLink: string;
  gradient?: string;
}

interface HeroCarouselProps {
  slides: HeroSlide[];
}

export function HeroCarousel({ slides }: HeroCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const progressRef = useRef<NodeJS.Timeout | null>(null);

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

  if (slides.length === 0) return null;

  const currentSlide = slides[currentIndex];

  // Check if link is external
  const isExternalLink = currentSlide.ctaLink.startsWith('http');

  return (
    <div 
      className="relative w-full aspect-[16/9] md:aspect-[2.4/1] overflow-hidden rounded-2xl mb-8"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Background with video or image */}
      <div className="absolute inset-0">
        {currentSlide.videoUrl ? (
          <div className="relative w-full h-full">
            <iframe
              src={currentSlide.videoUrl}
              className="absolute inset-0 w-full h-full object-cover"
              title={currentSlide.title}
              allow="autoplay; encrypted-media"
              allowFullScreen
              style={{ pointerEvents: 'none' }}
            />
            <div className="absolute inset-0 bg-black/60" />
          </div>
        ) : (
          <div
            className="absolute inset-0 transition-opacity duration-700 ease-in-out"
            style={{
              backgroundImage: `url(${currentSlide.imageUrl})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/50 to-transparent" />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="absolute inset-0 flex items-center px-8 md:px-12 lg:px-16">
        <div className="max-w-2xl">
          <h2 className="text-2xl md:text-4xl lg:text-5xl font-bold text-white tracking-tight mb-3 md:mb-4">
            {currentSlide.title}
          </h2>
          <p className="text-sm md:text-lg lg:text-xl text-zinc-300 mb-6 md:mb-8 line-clamp-2">
            {currentSlide.description}
          </p>
          {isExternalLink ? (
            <a
              href={currentSlide.ctaLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded-full text-sm md:text-base font-semibold transition-all duration-200 hover:scale-105 active:scale-95"
            >
              {currentSlide.ctaText}
              <ExternalLink className="size-4" />
            </a>
          ) : (
            <Link
              to={currentSlide.ctaLink}
              className="inline-flex items-center gap-2 px-6 py-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded-full text-sm md:text-base font-semibold transition-all duration-200 hover:scale-105 active:scale-95"
            >
              {currentSlide.ctaText}
              <Play className="size-4 fill-primary-foreground" />
            </Link>
          )}
        </div>
      </div>

      {/* Navigation Arrows */}
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

      {/* Pause/Play Button */}
      {shouldAutoRotate && (
        <button
          onClick={togglePause}
          className="absolute top-4 right-4 w-10 h-10 rounded-full bg-black/50 backdrop-blur-md border border-white/20 items-center justify-center text-white hover:bg-black/70 transition-colors"
          aria-label={isPaused ? "Play slideshow" : "Pause slideshow"}
          title={isPaused ? "Play slideshow" : "Pause slideshow"}
        >
          {isPaused ? <Play className="size-4 fill-current" /> : <Pause className="size-4" />}
        </button>
      )}

      {/* Progress Bar */}
      {shouldAutoRotate && (
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
          <div 
            className="h-full bg-primary transition-all duration-100 ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {/* Pagination Dots */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
        {slides.map((_, index) => (
          <button
            key={index}
            onClick={() => goToSlide(index)}
            className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
              index === currentIndex 
                ? "bg-white w-8" 
                : "bg-white/40 hover:bg-white/60"
            }`}
            aria-label={`Go to slide ${index + 1}`}
            aria-current={index === currentIndex ? "true" : "false"}
          />
        ))}
      </div>
    </div>
  );
}
