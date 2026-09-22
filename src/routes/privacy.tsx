import { createFileRoute, Link } from "@tanstack/react-router";
import {
  User,
  CreditCard,
  Download,
  Bell,
  Cookie,
  Share2,
  Database,
  Baby,
  RefreshCcw,
  ChevronRight,
  ArrowLeft,
  ShieldCheck,
} from "lucide-react";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Wesu+" },
      {
        name: "description",
        content:
          "How Wesu+ collects, uses, and protects your personal information across the website and mobile apps.",
      },
    ],
  }),
  component: PrivacyPage,
});

const clauses = [
  {
    id: "data-we-collect",
    icon: User,
    number: 1,
    title: "Information We Collect",
    content:
      "Account details you provide (name, email, password), your music activity (plays, likes, playlists, purchases, downloads), artist and label profile content you publish, and support messages you send us.",
  },
  {
    id: "payments",
    icon: CreditCard,
    number: 2,
    title: "Payments",
    content:
      "Purchases are processed by our payment partner Lenco (mobile money and cards). We receive transaction confirmations and receipts but never see or store your mobile-money PINs, card numbers, or bank credentials.",
  },
  {
    id: "offline-downloads",
    icon: Download,
    number: 3,
    title: "Offline Downloads",
    content:
      "Downloaded songs are encrypted and stored only on your own device. They can only be played inside Wesu+ and are never uploaded, shared, or accessible to other apps.",
  },
  {
    id: "notifications",
    icon: Bell,
    number: 4,
    title: "Notifications & Device Permissions",
    content:
      "The mobile app may request notification permission to show playback controls, and uses standard device storage for offline music. You can revoke permissions anytime in your device settings; playback features tied to them will simply be unavailable.",
  },
  {
    id: "cookies",
    icon: Cookie,
    number: 5,
    title: "Cookies & Local Storage",
    content:
      "We use sign-in sessions, theme preferences, player state, and cached media URLs stored locally in your browser or app. No third-party advertising cookies are used.",
  },
  {
    id: "sharing",
    icon: Share2,
    number: 6,
    title: "How We Share Information",
    content:
      "We do not sell your personal information. Data is shared only as needed to run the service: payment processing (Lenco), hosting and infrastructure providers, public artist/label profile content you choose to publish, and where required by law.",
  },
  {
    id: "retention",
    icon: Database,
    number: 7,
    title: "Data Retention & Your Rights",
    content:
      "We keep your account data while your account is active. You may request a copy, correction, or deletion of your personal data at any time via the Contact page — deletion removes your account, library, and purchases record.",
  },
  {
    id: "children",
    icon: Baby,
    number: 8,
    title: "Children",
    content:
      "Wesu+ is not directed at children under 13. If you believe a child has provided personal information, contact us and we will delete it promptly.",
  },
  {
    id: "changes",
    icon: RefreshCcw,
    number: 9,
    title: "Changes to This Policy",
    content:
      "We may update this policy as the service evolves. Material changes will be highlighted here with a new revision date; continued use of Wesu+ indicates acceptance.",
  },
];

function PrivacyPage() {
  return (
    <div className="min-h-screen pb-28">
      {/* Hero */}
      <div className="relative overflow-hidden bg-gradient-to-br from-primary/10 via-background to-background border-b border-border">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-primary/10 blur-3xl" />
          <div className="absolute top-12 left-0 w-72 h-72 rounded-full bg-primary/5 blur-2xl" />
        </div>
        <div className="relative max-w-4xl mx-auto px-6 py-16">
          <Link
            to="/terms"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8 group"
          >
            <ArrowLeft className="size-4 group-hover:-translate-x-1 transition-transform" />
            Back to Terms
          </Link>

          <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-full px-4 py-1.5 text-primary text-xs font-semibold mb-5 uppercase tracking-wider">
            <ShieldCheck className="size-3.5" />
            Your Data
          </div>

          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
            Privacy Policy
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl">
            How Wesu+ collects, uses, and protects your personal information
            across the website and mobile apps.
          </p>

          <p className="mt-6 text-xs text-muted-foreground/60">
            Last updated: September 2026
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="grid gap-4">
          {clauses.map((clause) => {
            const Icon = clause.icon;
            return (
              <div
                key={clause.id}
                id={clause.id}
                className="group flex items-start gap-5 bg-card border border-border rounded-2xl p-6 hover:border-primary/30 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5"
              >
                <div className="shrink-0 flex flex-col items-center gap-2">
                  <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                    <Icon className="size-5 text-primary" />
                  </div>
                  <span className="text-xs font-mono font-bold text-muted-foreground/40">
                    {String(clause.number).padStart(2, "0")}
                  </span>
                </div>

                <div className="flex-1 min-w-0 pt-1">
                  <h2 className="text-base font-semibold mb-1.5">
                    {clause.title}
                  </h2>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    {clause.content}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer links */}
        <div className="mt-6 rounded-2xl bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20 p-6 text-center">
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/contact"
              className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
            >
              Contact Support <ChevronRight className="size-3.5" />
            </Link>
            <span className="text-muted-foreground/40">·</span>
            <Link
              to="/terms"
              className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Terms &amp; Conditions <ChevronRight className="size-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
