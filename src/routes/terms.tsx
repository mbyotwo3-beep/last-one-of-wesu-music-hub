import { createFileRoute, Link } from "@tanstack/react-router";
import { Music, Headphones, ChevronRight, Shield } from "lucide-react";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms & Conditions — Wesu+" },
      {
        name: "description",
        content:
          "Read the Wesu+ Terms & Conditions for artists and listeners on Zambia's music streaming platform.",
      },
    ],
  }),
  component: TermsIndexPage,
});

function TermsIndexPage() {
  return (
    <div className="min-h-screen pb-28">
      {/* Hero */}
      <div className="relative overflow-hidden bg-gradient-to-br from-primary/10 via-background to-background border-b border-border">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full bg-primary/8 blur-3xl" />
        </div>
        <div className="relative max-w-4xl mx-auto px-6 py-20 text-center">
          <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-full px-4 py-1.5 text-primary text-xs font-semibold mb-6 uppercase tracking-wider">
            <Shield className="size-3.5" />
            Legal
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
            Terms &amp; Conditions
          </h1>
          <p className="text-muted-foreground text-lg max-w-xl mx-auto">
            Choose the terms that apply to you. Wesu+ has separate terms for
            artists and listeners.
          </p>
        </div>
      </div>

      {/* Cards */}
      <div className="max-w-4xl mx-auto px-6 py-16">
        <div className="grid md:grid-cols-2 gap-6">
          {/* Artist card */}
          <Link
            to="/terms-artist"
            className="group relative flex flex-col bg-card border border-border rounded-2xl p-8 overflow-hidden hover:border-primary/40 hover:shadow-xl hover:shadow-primary/10 transition-all duration-300"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

            <div className="size-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-6 group-hover:bg-primary/20 transition-colors">
              <Music className="size-7 text-primary" />
            </div>

            <h2 className="text-xl font-bold mb-2">For Artists</h2>
            <p className="text-muted-foreground text-sm leading-relaxed flex-1">
              Upload fees, revenue splits, content rights, dispute resolution,
              and everything artists need to know about distributing music on
              Wesu+.
            </p>

            <div className="mt-6 flex items-center gap-2 text-primary text-sm font-semibold">
              Read Artist Terms
              <ChevronRight className="size-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>

          {/* Listener card */}
          <Link
            to="/terms-listener"
            className="group relative flex flex-col bg-card border border-border rounded-2xl p-8 overflow-hidden hover:border-primary/40 hover:shadow-xl hover:shadow-primary/10 transition-all duration-300"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

            <div className="size-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-6 group-hover:bg-primary/20 transition-colors">
              <Headphones className="size-7 text-primary" />
            </div>

            <h2 className="text-xl font-bold mb-2">For Listeners</h2>
            <p className="text-muted-foreground text-sm leading-relaxed flex-1">
              Personal use policy, account security, payments, copyright
              responsibilities, and acceptable use guidelines for Wesu+
              listeners.
            </p>

            <div className="mt-6 flex items-center gap-2 text-primary text-sm font-semibold">
              Read Listener Terms
              <ChevronRight className="size-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>
        </div>

        {/* Note */}
        <p className="mt-10 text-center text-xs text-muted-foreground/60">
          Questions? Reach out to our{" "}
          <Link to="/contact" className="text-primary hover:underline">
            support team
          </Link>{" "}
          — available 24 hours a day.
        </p>
      </div>
    </div>
  );
}
