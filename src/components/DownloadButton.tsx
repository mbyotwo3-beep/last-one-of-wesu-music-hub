import { Download, Loader2 } from "lucide-react";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getDownloadAudioUrl } from "@/lib/listener.functions";
import { useAuth } from "@/hooks/use-auth";

export function DownloadButton({ songId, label = "Download" }: { songId: string; label?: string }) {
  const { user } = useAuth();
  const downloadFn = useServerFn(getDownloadAudioUrl);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Downloads are an authenticated feature. Hide the control for anonymous
  // listeners instead of showing a button that can only fail with 401.
  if (!user) return null;

  async function download() {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const result = await downloadFn({ data: { song_id: songId } });

      // The signed URL is hosted by Supabase (or the source CDN), so setting
      // it directly as an anchor href lets the browser navigate to the audio
      // page. Fetch the bytes first and download a same-origin Blob instead.
      const response = await fetch(result.url, {
        credentials: "omit",
      });
      if (!response.ok) {
        throw new Error(`Unable to download file (${response.status})`);
      }

      const blob = await response.blob();
      if (!blob.size) throw new Error("The downloaded file is empty");

      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = result.filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      // Keep the object URL alive for the browser's download hand-off, then
      // release the in-memory Blob.
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={download}
        disabled={loading}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-secondary border border-border text-xs font-semibold hover:bg-accent transition-colors disabled:opacity-50"
        aria-label={`${label} song`}
      >
        {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
        {loading ? "Preparing…" : label}
      </button>
      {error && <span className="text-[10px] text-destructive max-w-40 text-right">{error}</span>}
    </span>
  );
}
