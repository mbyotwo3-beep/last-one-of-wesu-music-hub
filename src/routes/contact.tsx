import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Mail, MapPin, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { submitSupportMessage, validateSupportMessage } from "@/lib/contact.functions";

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
  const submitFn = useServerFn(submitSupportMessage);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (sending) return;
    const problem = validateSupportMessage({ name, email, subject, message });
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setSending(true);
    try {
      await submitFn({ data: { name, email, subject, message } });
      setSent(true);
      toast.success("Message sent — our team will get back to you by email.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Couldn't send your message";
      setError(msg);
    } finally {
      setSending(false);
    }
  }

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
                  <h3 className="font-semibold">Support inbox</h3>
                  <p className="text-muted-foreground text-sm">
                    Messages go straight to our admin team — no mailbox needed. We reply by
                    email, usually within 2 business days.
                  </p>
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
            {sent ? (
              <div className="text-center py-10">
                <CheckCircle2 className="size-12 text-primary mx-auto mb-4" />
                <h2 className="text-xl font-semibold mb-2">Message sent</h2>
                <p className="text-sm text-muted-foreground">
                  Thanks {name.split(" ")[0] || "there"} — our admin team will reply to{" "}
                  {email}.
                </p>
              </div>
            ) : (
              <>
                <h2 className="text-xl font-semibold mb-6">Send a Message</h2>
                <form className="space-y-4" onSubmit={handleSubmit}>
                  <div>
                    <label className="block text-sm font-medium mb-2">Your Name</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Mutinta Phiri"
                      className="w-full bg-secondary/50 border border-white/10 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-primary/50 text-foreground"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Email</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full bg-secondary/50 border border-white/10 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-primary/50 text-foreground"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Subject <span className="font-normal text-muted-foreground">(optional)</span>
                    </label>
                    <input
                      type="text"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder="e.g. Payment issue, Takedown request"
                      className="w-full bg-secondary/50 border border-white/10 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-primary/50 text-foreground"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Message</label>
                    <textarea
                      rows={4}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="How can we help?"
                      className="w-full bg-secondary/50 border border-white/10 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-primary/50 text-foreground resize-none"
                    />
                  </div>
                  {error && (
                    <p className="text-sm text-destructive" role="alert">
                      {error}
                    </p>
                  )}
                  <button
                    type="submit"
                    disabled={sending}
                    className="w-full py-3 bg-primary text-obsidian rounded-xl font-bold hover:brightness-110 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {sending && <Loader2 className="size-4 animate-spin" />}
                    {sending ? "Sending…" : "Send Message"}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
