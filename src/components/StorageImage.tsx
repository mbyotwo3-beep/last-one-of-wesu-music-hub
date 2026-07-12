import { useEffect, useState } from "react";
import { Music2 } from "lucide-react";
import { resolveImageUrl, peekImageUrl, invalidateImageUrl, type ImageBucket } from "@/lib/storage-url";

interface Props {
  bucket: ImageBucket;
  path?: string | null;
  alt: string;
  className?: string;
  loading?: "eager" | "lazy";
  onClick?: () => void;
}

/**
 * Renders an image stored in a private Supabase bucket by lazily signing the
 * URL on mount. On error (expired/invalid signed URL) it invalidates the
 * cache and re-signs once before falling back to the placeholder.
 */
export function StorageImage({ bucket, path, alt, className, loading = "lazy", onClick }: Props) {
  const [url, setUrl] = useState<string | null>(() => peekImageUrl(bucket, path));
  const [failed, setFailed] = useState(false);
  const [retried, setRetried] = useState(false);

  useEffect(() => {
    let cancel = false;
    setFailed(false);
    setRetried(false);
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

  const handleError = () => {
    if (retried || !path) {
      setFailed(true);
      return;
    }
    setRetried(true);
    invalidateImageUrl(bucket, path);
    resolveImageUrl(bucket, path)
      .then((u) => setUrl(u ? `${u}${u.includes("?") ? "&" : "?"}r=${Date.now()}` : null))
      .catch(() => setFailed(true));
  };

  if (!url || failed) {
    return (
      <div className={`flex items-center justify-center bg-card ${className ?? ""}`} onClick={onClick}>
        <Music2 className="size-4 text-muted-foreground" />
      </div>
    );
  }
  return <img src={url} alt={alt} className={className} loading={loading} onClick={onClick} onError={handleError} />;
}
