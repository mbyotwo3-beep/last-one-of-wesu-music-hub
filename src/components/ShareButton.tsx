import { Share2 } from "lucide-react";
import { toast } from "sonner";

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
      if (navigator.share) {
        await navigator.share({ title, text, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
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
