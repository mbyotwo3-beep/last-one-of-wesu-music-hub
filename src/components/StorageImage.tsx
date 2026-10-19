import { useEffect, useState } from "react";
import { Music2 } from "lucide-react";
import {
  resolveImageUrl,
  peekImageUrl,
  invalidateImageUrl,
  type ImageBucket,
} from "@/lib/storage-url";

interface Props {
  bucket: ImageBucket;
  path?: string | null;
  alt: string;
  className?: string;
  loading?: "eager" | "lazy";
  onClick?: () => void;
  /**
   * Fade the picture in once it has decoded, instead of popping it into a
   * frame. Only meaningful inside CoverArt, which owns the surface the cover
   * fades in OVER — used bare it would push the fade against nothing.
   */
  fade?: boolean;
}

/**
 * Renders an image stored in a private Supabase bucket by lazily signing the
 * URL on mount. On error (expired/invalid signed URL) it invalidates the
 * cache and re-signs once before falling back to the placeholder.
 */
export function StorageImage({ bucket, path, alt, className, loading = "lazy", onClick, fade = false }: Props) {
  const cachedUrl = peekImageUrl(bucket, path);
  const [url, setUrl] = useState<string | null>(cachedUrl);
  const [failed, setFailed] = useState(false);
  const [retried, setRetried] = useState(false);
  const [isLoading, setIsLoading] = useState(() => !cachedUrl && Boolean(path));
  // Fades only after the element reports a load. Seeded true when a cached URL
  // is already decoded-equivalent is NOT correct: setting 1 at once would pop.
  const [painted, setPainted] = useState(false);

  useEffect(() => {
    let cancel = false;
    setFailed(false);
    setRetried(false);

    if (!path) {
      setUrl(null);
      setIsLoading(false);
      return;
    }

    const cached = peekImageUrl(bucket, path);
    if (cached) {
      setUrl(cached);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    resolveImageUrl(bucket, path)
      .then((u) => {
        if (!cancel) {
          setUrl(u);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (!cancel) {
          setUrl(null);
          setIsLoading(false);
        }
      });
    return () => {
      cancel = true;
    };
  }, [bucket, path]);

  const handleError = () => {
    if (retried || !path) {
      setFailed(true);
      setIsLoading(false);
      return;
    }
    setRetried(true);
    invalidateImageUrl(bucket, path);
    resolveImageUrl(bucket, path)
      // Re-sign only — never append cache-busters, they invalidate the
      // R2 signature and guarantee a second failure.
      .then((u) => {
        setUrl(u);
        if (!u) setFailed(true);
      })
      .catch(() => {
        setFailed(true);
        setIsLoading(false);
      });
  };

  const handleLoad = () => {
    setIsLoading(false);
    setPainted(true);
  };

  if (isLoading) {
    return (
      <div
        className={`flex items-center justify-center bg-card animate-pulse ${className ?? ""}`}
        onClick={onClick}
      >
        <Music2 className="size-4 text-muted-foreground opacity-50" />
      </div>
    );
  }

  if (!url || failed) {
    return (
      <div
        className={`flex items-center justify-center bg-card ${className ?? ""}`}
        onClick={onClick}
      >
        <Music2 className="size-4 text-muted-foreground" />
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={alt}
      className={`${className ?? ""} transition-opacity duration-300 ease-out`}
      style={fade ? { opacity: painted ? 1 : 0 } : undefined}
      loading={loading}
      decoding="async"
      onClick={onClick}
      onError={handleError}
      onLoad={handleLoad}
    />
  );
}
