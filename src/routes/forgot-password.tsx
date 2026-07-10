import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Mail, ArrowRight, Music } from "lucide-react";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [
      { title: "Reset your password — Wesu+" },
      { name: "description", content: "Reset your Wesu+ account password." },
    ],
  }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: "https://www.wesuplusly.com/reset-password",
      });
      if (error) throw error;
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center size-12 rounded-2xl bg-primary/10 mb-4">
            <Music className="size-6 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">Forgot your password?</h1>
          <p className="text-muted-foreground mt-2">
            Enter your email and we'll send you a reset link.
          </p>
        </div>

        {sent ? (
          <div className="p-4 rounded-xl bg-primary/10 border border-primary/20 text-sm text-center">
            Check <span className="font-semibold">{email}</span> for a password reset link.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                {error}
              </div>
            )}
            <div>
              <label className="block text-sm font-medium mb-2">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="you@example.com"
                  className="w-full bg-card border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-primary/50"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-primary text-obsidian rounded-xl font-bold hover:brightness-110 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? "Sending..." : (<>Send reset link<ArrowRight className="size-4" /></>)}
            </button>
          </form>
        )}

        <div className="mt-8 text-center">
          <Link to="/auth" className="text-sm text-muted-foreground hover:text-foreground">
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
