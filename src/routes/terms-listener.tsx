import { createFileRoute, Link } from "@tanstack/react-router";
import {
  User,
  Lock,
  CreditCard,
  Copyright,
  AlertTriangle,
  Wifi,
  Eye,
  RefreshCcw,
  ChevronRight,
  ArrowLeft,
  Headphones,
} from "lucide-react";

export const Route = createFileRoute("/terms-listener")({
  head: () => ({
    meta: [
      { title: "Listener Terms & Conditions — Wesu+" },
      {
        name: "description",
        content:
          "Read the Wesu+ Terms & Conditions for listeners streaming and purchasing music on the platform.",
      },
    ],
  }),
  component: ListenerTermsPage,
});

const clauses = [
  {
    id: "personal-use",
    icon: User,
    number: 1,
    title: "Personal Use",
    content:
      "Music streamed or purchased on Wesu+ is for your personal, non-commercial use only.",
  },
  {
    id: "account-security",
    icon: Lock,
    number: 2,
    title: "Account Security",
    content:
      "You are responsible for keeping your account details secure and for all activity on your account.",
  },
  {
    id: "payments",
    icon: CreditCard,
    number: 3,
    title: "Payments",
    content:
      "All purchases and subscription payments are final unless otherwise required by law.",
  },
  {
    id: "copyright",
    icon: Copyright,
    number: 4,
    title: "Respect Copyright",
    content:
      "You may not copy, distribute, reproduce, or upload music from Wesu+ without the permission of the copyright owner.",
  },
  {
    id: "acceptable-use",
    icon: AlertTriangle,
    number: 5,
    title: "Acceptable Use",
    content:
      "Do not use the platform for unlawful activities, fraud, or any action that disrupts the service or other users.",
  },
  {
    id: "availability",
    icon: Wifi,
    number: 6,
    title: "Service Availability",
    content:
      "While we strive to provide uninterrupted service, Wesu+ cannot guarantee continuous availability due to maintenance or technical issues.",
  },
  {
    id: "privacy",
    icon: Eye,
    number: 7,
    title: "Privacy",
    content:
      "Your personal information is handled in accordance with our Privacy Policy and is used to provide and improve our services.",
  },
  {
    id: "changes",
    icon: RefreshCcw,
    number: 8,
    title: "Changes to Terms",
    content:
      "Wesu+ may update these Terms & Conditions at any time. Continued use of the platform indicates your acceptance of any changes.",
  },
];

function ListenerTermsPage() {
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
            <Headphones className="size-3.5" />
            For Listeners
          </div>

          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
            Listener Terms &amp; Conditions
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl">
            Welcome to Wesu+. By creating an account or using our platform, you
            agree to the following terms.
          </p>

          <p className="mt-6 text-xs text-muted-foreground/60">
            Last updated: August 2025
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
                {/* Number badge */}
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

        {/* Agreement notice */}
        <div className="mt-8 rounded-2xl bg-gradient-to-br from-card to-card/80 border border-border p-6">
          <p className="text-sm text-muted-foreground leading-relaxed text-center">
            By using{" "}
            <strong className="text-primary">Wesu+</strong>, you acknowledge
            that you have{" "}
            <strong className="text-foreground">read, understood, and agreed</strong>{" "}
            to these Terms &amp; Conditions.
          </p>
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
              to="/terms-artist"
              className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Artist Terms <ChevronRight className="size-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
