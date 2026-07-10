import { createFileRoute } from "@tanstack/react-router";
import { Mail, MapPin, Phone } from "lucide-react";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact & Support — Wesu+" },
      { name: "description", content: "Get in touch with Wesu+ Music Streaming support." },
    ],
  }),
  component: ContactPage,
});

function ContactPage() {
  return (
    <div className="min-h-screen pb-24">
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="grid lg:grid-cols-2 gap-16">
          <div>
            <h1 className="text-4xl font-bold mb-4">Contact & Support</h1>
            <p className="text-muted-foreground mb-12 text-lg">
              Have questions? We are here to help artists and listeners get the most out of Wesu+.
            </p>

            <div className="space-y-6">
              <div className="flex items-start gap-4">
                <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Mail className="size-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold">Email</h3>
                  <p className="text-muted-foreground text-sm">support@wesuplus.com</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Phone className="size-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold">Phone</h3>
                  <p className="text-muted-foreground text-sm">+260 97X XXX XXX</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <MapPin className="size-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold">Location</h3>
                  <p className="text-muted-foreground text-sm">Lusaka, Zambia</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-card border border-white/5 rounded-2xl p-8">
            <h2 className="text-xl font-semibold mb-6">Send a Message</h2>
            <form className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">First Name</label>
                  <input
                    type="text"
                    className="w-full bg-secondary/50 border border-white/10 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-primary/50 text-foreground"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Last Name</label>
                  <input
                    type="text"
                    className="w-full bg-secondary/50 border border-white/10 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-primary/50 text-foreground"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Email</label>
                <input
                  type="email"
                  className="w-full bg-secondary/50 border border-white/10 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-primary/50 text-foreground"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Message</label>
                <textarea
                  rows={4}
                  className="w-full bg-secondary/50 border border-white/10 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-primary/50 text-foreground resize-none"
                />
              </div>
              <button
                type="submit"
                className="w-full py-3 bg-primary text-obsidian rounded-xl font-bold hover:brightness-110 transition-all"
              >
                Send Message
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
