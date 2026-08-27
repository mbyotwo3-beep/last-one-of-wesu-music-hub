import { useId, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Check, ExternalLink, FileText } from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type TermsConsentProps = {
  kind: "listener" | "artist";
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
};

const terms = {
  listener: {
    title: "Listener Terms & Conditions",
    intro:
      "These terms explain how you may use Wesu+ to stream and purchase music.",
    route: "/terms-listener" as const,
    points: [
      "Music streamed or purchased on Wesu+ is for your personal, non-commercial use.",
      "Keep your account secure and do not share access or payment details.",
      "Purchases are final unless a refund is required by applicable law.",
      "Do not copy, redistribute, or upload music without permission from the copyright owner.",
      "Wesu+ may update these terms and may temporarily limit service for maintenance or safety.",
    ],
  },
  artist: {
    title: "Artist Terms & Conditions",
    intro:
      "These terms explain the rights and responsibilities of artists who submit music to Wesu+.",
    route: "/terms-artist" as const,
    points: [
      "You must own or have permission to distribute every song, recording, image, and other submission.",
      "You retain ownership of your work while granting Wesu+ permission to host, stream, and sell it.",
      "Artists receive the revenue share described in the Artist Terms for eligible sales.",
      "Content may be reviewed, rejected, or removed when it violates the terms or another person's rights.",
      "Contact support first so Wesu+ can help resolve account, payment, or rights disputes.",
    ],
  },
} as const;

export function TermsConsent({ kind, checked, onCheckedChange, disabled }: TermsConsentProps) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const copy = terms[kind];
  const label = kind === "artist" ? "Artist Terms & Conditions" : "Listener Terms & Conditions";

  return (
    <div className="space-y-3 rounded-xl border border-white/10 bg-background/30 p-4">
      <div className="flex items-start gap-3">
        <label htmlFor={id} className="relative mt-0.5 shrink-0 cursor-pointer">
          <input
            id={id}
            type="checkbox"
            checked={checked}
            onChange={(event) => onCheckedChange(event.target.checked)}
            disabled={disabled}
            className="peer sr-only"
          />
          <span
            aria-hidden="true"
            className="flex size-5 items-center justify-center rounded border border-white/20 bg-card transition-colors peer-checked:border-primary peer-checked:bg-primary peer-disabled:opacity-50"
          >
            {checked && <Check className="size-3.5 text-obsidian" />}
          </span>
        </label>
        <div className="min-w-0 text-sm text-muted-foreground">
          <p className="leading-relaxed">
            <label htmlFor={id} className="cursor-pointer">
              I have read and agree to the {kind === "artist" ? "" : "Wesu+ "}
            </label>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="font-medium text-primary underline-offset-2 hover:underline"
            >
              {label}
            </button>
            {kind === "listener" ? " and understand the rules for using Wesu+." : "."}
          </p>
          <div className="mt-2">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
            >
              <FileText className="size-3.5" />
              Review before continuing
            </button>
          </div>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{copy.title}</DialogTitle>
            <DialogDescription>{copy.intro}</DialogDescription>
          </DialogHeader>

          <ul className="list-disc space-y-3 pl-5 text-sm leading-relaxed text-muted-foreground">
            {copy.points.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>

          <Link
            to={copy.route}
            onClick={() => setOpen(false)}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            Read the complete {copy.title.toLowerCase()}
            <ExternalLink className="size-3.5" />
          </Link>

          <DialogFooter className="gap-2 sm:gap-2">
            <DialogClose asChild>
              <button type="button" className="rounded-lg border border-border px-4 py-2 text-sm">
                Close
              </button>
            </DialogClose>
            <button
              type="button"
              onClick={() => {
                onCheckedChange(true);
                setOpen(false);
              }}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              I agree
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
