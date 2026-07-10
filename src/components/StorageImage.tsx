import { useEffect, useState } from "react";
import { Music2 } from "lucide-react";
import { resolveImageUrl, peekImageUrl, type ImageBucket } from "@/lib/storage-url";

interface Props {
  bucket: ImageBucket;
  path?: string | null;
  alt: string;
  className?: string;
  loading?: "eager" | "lazy";
}

/**
 * Renders an image stored in a private Supabase bucket by lazily signing the
 * URL on mount. Falls back to a music-note placeholder while loading / on
 * error. Values that already look like absolute URLs are used as-is.
 */
export function StorageImage({ bucket, path, alt, className, loading = "lazy" }: Props) {
  const [url, setUrl] = useState<string | null>(() => peekImageUrl(bucket, path));

  useEffect(() => {
    let cancel = false;
    if (!path) {
      setUrl(null);
      return;
    }
    const cached = peekImageUrl(bucket, path);
    if (cached) {
      setUrl(cached);
      return;
    }
    resolveImageUrl(bucket, path)
      .then((u) => {
        if (!cancel) setUrl(u);
      })
      .catch(() => {
        if (!cancel) setUrl(null);
      });
    return () => {
      cancel = true;
    };
  }, [bucket, path]);

  if (!url) {
    return (
      <div className={`flex items-center justify-center bg-card ${className ?? ""}`}>
        <Music2 className="size-4 text-muted-foreground" />
      </div>
    );
  }
  return <img src={url} alt={alt} className={className} loading={loading} />;
}
