import { Download, Loader2 } from "lucide-react";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getDownloadAudioUrl } from "@/lib/listener.functions";

export function DownloadButton({ songId, label = "Download" }: { songId: string; label?: string }) {
  const downloadFn = useServerFn(getDownloadAudioUrl);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const result = await downloadFn({ data: { song_id: songId } });
      const anchor = document.createElement("a");
      anchor.href = result.url;
      anchor.download = result.filename;
      anchor.rel = "noopener";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } catch (err) {
      setError((err as Error).message || "Download failed");
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
