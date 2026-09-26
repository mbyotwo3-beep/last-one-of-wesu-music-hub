import { Share2 } from "lucide-react";
import { toast } from "sonner";
import { copyTextToClipboard } from "@/lib/external-url";

type Props = {
  path: string;
  title: string;
  text?: string;
  className?: string;
};

export function ShareButton({ path, title, text, className }: Props) {
  const share = async () => {
    const url = new URL(path, window.location.origin).toString();
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title, text, url });
        return;
      }
      if (await copyTextToClipboard(url)) {
        toast.success("Link copied");
      } else {
        toast.error("Sharing isn't available on this device");
      }
    } catch (error) {
      // Dismissing the native share sheet is not an error the listener needs
      // to see. Surface only failures that prevented copying a usable link.
      if ((error as DOMException | undefined)?.name !== "AbortError") {
        toast.error("Could not share this link. Please try again.");
      }
    }
  };

  return (
    <button
      type="button"
      onClick={share}
      className={
        className ??
        "inline-flex items-center gap-2 rounded-full border border-border bg-secondary px-4 py-2 text-sm font-semibold transition-colors hover:bg-accent"
      }
      aria-label={`Share ${title}`}
    >
      <Share2 className="size-4" />
      Share
    </button>
  );
}
