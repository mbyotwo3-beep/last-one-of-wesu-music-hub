import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Lock, ArrowRight, Music } from "lucide-react";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Set a new password — Wesu+" },
      { name: "description", content: "Choose a new password for your Wesu+ account." },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [expired, setExpired] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Supabase parses the recovery token from the URL hash and fires
  // PASSWORD_RECOVERY. Only that event unlocks the form — a plain SIGNED_IN
  // or an existing session must NOT (otherwise any logged-in visitor, with no
  // recovery link at all, gets a password form). Native code-exchange links
  // surface SIGNED_IN instead, so they set a one-time recovery_pending flag.
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });
    try {
      if (sessionStorage.getItem("recovery_pending") === "1") {
        sessionStorage.removeItem("recovery_pending");
        setReady(true);
      }
    } catch {
      /* ignore */
    }
    // Expired/used links never fire — stop hanging on "Verifying…" forever.
    const t = setTimeout(() => {
      setReady((r) => {
        if (!r) setExpired(true);
        return r;
      });
    }, 15000);
    timers.current.push(t);
    return () => {
      sub.subscription.unsubscribe();
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
  }, []);

  useEffect(() => {
    return () => {
      timers.current.forEach(clearTimeout);
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) return setError("Password must be at least 6 characters.");
    if (password !== confirm) return setError("Passwords don't match.");
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setDone(true);
      timers.current.push(setTimeout(() => navigate({ to: "/dashboard" }), 1500));
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
          <h1 className="text-2xl font-bold">Set a new password</h1>
        </div>

        {!ready ? (
          expired ? (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-center space-y-3">
              <p>This reset link is invalid or has expired.</p>
              <Link to="/forgot-password" className="text-primary hover:underline font-semibold">
                Request a new reset link
              </Link>
            </div>
          ) : (
            <p className="text-center text-muted-foreground text-sm">Verifying reset link…</p>
          )
        ) : done ? (
          <div className="p-4 rounded-xl bg-primary/10 border border-primary/20 text-sm text-center">
            Password updated. Redirecting…
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                {error}
              </div>
            )}
            <div>
              <label className="block text-sm font-medium mb-2">New password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  placeholder="Min 6 characters"
                  className="w-full bg-card border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-primary/50"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Confirm password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  minLength={6}
                  placeholder="Repeat password"
                  className="w-full bg-card border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-primary/50"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-primary text-obsidian rounded-xl font-bold hover:brightness-110 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? (
                "Saving..."
              ) : (
                <>
                  Update password
                  <ArrowRight className="size-4" />
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
