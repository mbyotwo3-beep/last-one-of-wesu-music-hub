import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Shield,
  Music,
  DollarSign,
  Headphones,
  MessageCircle,
  RefreshCcw,
  ChevronRight,
  ArrowLeft,
} from "lucide-react";

export const Route = createFileRoute("/terms-artist")({
  head: () => ({
    meta: [
      { title: "Artist Terms & Conditions — Wesu+" },
      {
        name: "description",
        content:
          "Read the Wesu+ Streaming Services Terms & Conditions for artists uploading and distributing music on the platform.",
      },
    ],
  }),
  component: ArtistTermsPage,
});

const sections = [
  {
    id: "introduction",
    icon: Shield,
    title: "Introduction",
    content: (
      <p className="text-muted-foreground leading-relaxed">
        Welcome to <strong className="text-foreground">Wesu+</strong>, Zambia's
        home for music streaming and digital music sales. By using our platform,
        you agree to these Terms &amp; Conditions. Please read them carefully
        before uploading, purchasing, or streaming content.
      </p>
    ),
  },
  {
    id: "ip",
    icon: Music,
    title: "Content & Intellectual Property",
    content: (
      <p className="text-muted-foreground leading-relaxed">
        Artists retain <strong className="text-foreground">full ownership</strong>{" "}
        and copyright of the music they upload to Wesu+. By uploading content,
        you confirm that you own the rights or have permission to distribute it.
        Wesu+ is granted permission to host, stream, and sell your content
        through the platform.
      </p>
    ),
  },
  {
    id: "revenue",
    icon: DollarSign,
    title: "Artist Revenue",
    content: (
      <div className="space-y-4">
        <div className="flex items-start gap-4 bg-primary/5 border border-primary/20 rounded-xl p-4">
          <div className="size-2 rounded-full bg-primary mt-2 shrink-0" />
          <div>
            <p className="font-semibold text-foreground text-sm">Free Song Upload</p>
            <p className="text-muted-foreground text-sm mt-1">
              A one-time upload fee of{" "}
              <span className="text-primary font-bold">K100 per song</span>.
            </p>
          </div>
        </div>
        <div className="flex items-start gap-4 bg-primary/5 border border-primary/20 rounded-xl p-4">
          <div className="size-2 rounded-full bg-primary mt-2 shrink-0" />
          <div>
            <p className="font-semibold text-foreground text-sm">Premium Songs</p>
            <p className="text-muted-foreground text-sm mt-1">
              Artists set their own selling price. Wesu+ retains{" "}
              <span className="text-primary font-bold">18%</span> of each sale
              or revenue generated, while the remaining{" "}
              <span className="text-primary font-bold">82%</span> is paid to the
              artist.
            </p>
          </div>
        </div>
        {/* Visual split */}
        <div className="rounded-xl overflow-hidden border border-border mt-2">
          <div className="flex h-4">
            <div
              className="bg-primary flex items-center justify-center"
              style={{ width: "82%" }}
            />
            <div
              className="bg-muted flex items-center justify-center"
              style={{ width: "18%" }}
            />
          </div>
          <div className="flex text-xs px-3 py-2 justify-between text-muted-foreground">
            <span>
              <span className="text-primary font-semibold">82%</span> — Artist
            </span>
            <span>
              <span className="font-semibold">18%</span> — Wesu+
            </span>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: "support",
    icon: Headphones,
    title: "Customer Support",
    content: (
      <p className="text-muted-foreground leading-relaxed">
        Our customer support team is available{" "}
        <strong className="text-foreground">24 hours a day</strong> to assist
        with technical issues, account inquiries, payments, and other
        platform-related questions.
      </p>
    ),
  },
  {
    id: "disputes",
    icon: MessageCircle,
    title: "Problems & Disputes",
    content: (
      <p className="text-muted-foreground leading-relaxed">
        If a dispute arises between users, artists, or Wesu+, we encourage all
        parties to contact our support team first. We will make every reasonable
        effort to resolve issues{" "}
        <strong className="text-foreground">fairly and promptly</strong>.
      </p>
    ),
  },
  {
    id: "changes",
    icon: RefreshCcw,
    title: "Changes to These Terms",
    content: (
      <p className="text-muted-foreground leading-relaxed">
        Wesu+ may update these Terms &amp; Conditions from time to time.
        Continued use of the platform after any updates means you accept the
        revised terms.
      </p>
    ),
  },
];

function ArtistTermsPage() {
  return (
    <div className="min-h-screen pb-28">
      {/* Hero */}
      <div className="relative overflow-hidden bg-gradient-to-br from-primary/10 via-background to-background border-b border-border">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-primary/10 blur-3xl" />
          <div className="absolute top-12 right-0 w-72 h-72 rounded-full bg-primary/5 blur-2xl" />
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
            <Music className="size-3.5" />
            For Artists
          </div>

          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
            Artist Terms &amp; Conditions
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl">
            Wesu+ Streaming Services — everything you need to know about
            uploading and distributing your music on our platform.
          </p>

          <p className="mt-6 text-xs text-muted-foreground/60">
            Last updated: August 2025
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="grid gap-6">
          {sections.map((section, idx) => {
            const Icon = section.icon;
            return (
              <div
                key={section.id}
                id={section.id}
                className="group bg-card border border-border rounded-2xl p-6 md:p-8 hover:border-primary/30 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5"
              >
                <div className="flex items-start gap-4">
                  <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                    <Icon className="size-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-xs font-mono text-muted-foreground/50">
                        {String(idx + 1).padStart(2, "0")}
                      </span>
                      <h2 className="text-lg font-semibold">{section.title}</h2>
                    </div>
                    {section.content}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer note */}
        <div className="mt-10 rounded-2xl bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20 p-6 text-center">
          <p className="text-sm text-muted-foreground">
            Thank you for choosing{" "}
            <strong className="text-primary">Wesu+</strong> — where music speaks
            and artists grow.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/contact"
              className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
            >
              Contact Support <ChevronRight className="size-3.5" />
            </Link>
            <span className="text-muted-foreground/40">·</span>
            <Link
              to="/terms-listener"
              className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Listener Terms <ChevronRight className="size-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
