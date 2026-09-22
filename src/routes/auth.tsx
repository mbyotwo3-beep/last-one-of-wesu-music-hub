import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Music, Mail, Lock, User, ArrowRight, Eye, EyeOff } from "lucide-react";
import { toggleFollow } from "@/lib/follow.functions";
import { saveTrack, unsaveTrack } from "@/lib/saved-tracks.functions";
import { saveAlbum, unsaveAlbum } from "@/lib/saved-albums.functions";
import { acceptInvitation } from "@/lib/invitations.functions";
import { TermsConsent } from "@/components/TermsConsent";
import { toast } from "sonner";
import { useIsNative } from "@/hooks/use-platform";
import {
  stashPendingAction,
  takePendingAction,
  mergePendingAction,
  hasPendingAction,
  safeAppRedirect,
  type PendingAction,
} from "@/lib/post-auth-action";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign In — Wesu+" },
      { name: "description", content: "Sign in or create an account on Wesu+ Music Streaming." },
    ],
  }),
  validateSearch: (
    search: Record<string, unknown>,
  ): {
    redirect?: string;
    action?: string;
    artistId?: string;
    itemId?: string;
    itemType?: string;
    invite?: string;
    type?: string;
  } => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
    action: typeof search.action === "string" ? search.action : undefined,
    artistId: typeof search.artistId === "string" ? search.artistId : undefined,
    itemId: typeof search.itemId === "string" ? search.itemId : undefined,
    itemType: typeof search.itemType === "string" ? search.itemType : undefined,
    // Collaboration / label invitation context (previously pointed at a
    // non-existent /register route and was dropped here, so invites died).
    invite: typeof search.invite === "string" ? search.invite : undefined,
    type: typeof search.type === "string" ? search.type : undefined,
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  // Google blocks OAuth inside embedded WebViews: on native the Google
  // button is hidden (email sign-in works; Google stays on the website).
  const isNative = useIsNative();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const { redirect, action, artistId, itemId, itemType, invite } = search;
  const acceptInviteFn = useServerFn(acceptInvitation);

  // Only same-origin paths are valid redirect targets — anything else
  // (absolute URLs, protocol-relative) falls back to the dashboard.
  const safeRedirect =
    redirect && redirect.startsWith("/") && !redirect.startsWith("//") ? redirect : undefined;

  // Invitation links survive email-confirmation signups (which create no
  // session yet) via sessionStorage, and are consumed once after auth.
  useEffect(() => {
    try {
      if (invite) sessionStorage.setItem("pending_invite", invite);
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invite]);

  // After an OAuth round-trip the page reloads with a session but without
  // the original ?action — recover the stashed intent, replay it, and land
  // back where the user started (Google-style continue flow).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (cancelled || !data.session) return;
        const params: PendingAction = { action, artistId, itemId, itemType, redirect, invite };
        const merged = mergePendingAction(params, takePendingAction(sessionStorage));
        if (cancelled || !hasPendingAction(merged)) return;
        const dest = await runPostAuthAction(merged);
        if (!cancelled) navigate({ to: dest as any });
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const form = e.currentTarget as HTMLFormElement;
      form.requestSubmit();
    }
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (mode === "signup") {
        // Email-confirmation round-trips wipe the query string — stash the
        // intent so it replays after the user confirms and signs in.
        stashPendingAction(sessionStorage, { action, artistId, itemId, itemType, redirect, invite });
        if (!agreedToTerms) {
          setError("You must agree to the Terms & Conditions to create an account.");
          setLoading(false);
          return;
        }
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: name,
              terms_accepted: true,
              terms_accepted_at: new Date().toISOString(),
              terms_version: "2025-08-01",
            },
            emailRedirectTo: `${window.location.origin}${safeRedirect || "/dashboard"}`,
          },
        });
        if (error) throw error;
        if (!data.session) {
          setNotice("Account created. Check your email to confirm your address, then sign in.");
          setMode("signin");
        } else {
          await handlePostAuthAction();
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        await handlePostAuthAction();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }

  function readPendingInvite(): string | null {
    try {
      return sessionStorage.getItem("pending_invite");
    } catch {
      return null;
    }
  }

  function clearPendingInvite() {
    try {
      sessionStorage.removeItem("pending_invite");
    } catch {
      /* ignore */
    }
  }

  /**
   * Complete the pending anonymous intent (like/follow/save/invite) and
   * return the destination — the user lands back where they started with
   * the action DONE, not just toasted. Shared by email, signup, and OAuth
   * return paths.
   */
  async function runPostAuthAction(act: PendingAction): Promise<string> {
    const dest = safeAppRedirect(act.redirect ?? safeRedirect);
    // Handle post-authentication actions like follow, save, like
    if (act.action === "follow" && act.artistId) {
      try {
        const result = await toggleFollow({ data: { artist_id: act.artistId } });
        toast.success(result.action === "followed" ? "Following artist" : "Unfollowed artist");
      } catch (err) {
        console.error("Failed to execute follow action after auth:", err);
        toast.error("Failed to follow artist");
      }
    } else if (act.action === "save" && act.itemId && act.itemType) {
      try {
        if (act.itemType === "song") {
          await saveTrack({ data: { song_id: act.itemId } });
          toast.success("Song saved to library");
        } else if (act.itemType === "album") {
          await saveAlbum({ data: { album_id: act.itemId } });
          toast.success("Album saved to library");
        }
      } catch (err) {
        console.error("Failed to execute save action after auth:", err);
        toast.error("Failed to save item");
      }
    } else if (act.action === "like" && act.itemId && act.itemType === "song") {
      try {
        await saveTrack({ data: { song_id: act.itemId } });
        toast.success("Song liked");
      } catch (err) {
        console.error("Failed to execute like action after auth:", err);
        toast.error("Failed to like song");
      }
    } else if (act.action === "addPlaylist" && act.itemId && act.itemType === "song") {
      // For add to playlist, we redirect back to the page and let the user add to playlist
      // since we need them to select which playlist
      return dest;
    } else if (act.invite || readPendingInvite()) {
      // Collaboration / label invitation accepted right after sign-in/up.
      const invitationId = act.invite ?? readPendingInvite();
      try {
        await acceptInviteFn({ data: { invitation_id: invitationId! } });
        clearPendingInvite();
        toast.success("Invitation accepted — welcome aboard!");
      } catch (err) {
        console.error("Failed to accept invitation after auth:", err);
        toast.error(
          err instanceof Error ? err.message : "Signed in, but the invitation could not be accepted",
        );
      }
    }
    return dest;
  }

  async function handlePostAuthAction() {
    const dest = await runPostAuthAction({ action, artistId, itemId, itemType, redirect, invite });
    // Redirect to the original destination
    navigate({ to: dest as any });
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center size-12 rounded-2xl bg-primary/10 mb-4">
            <Music className="size-6 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">
            {mode === "signin" ? "Welcome back" : "Create account"}
          </h1>
          <p className="text-muted-foreground mt-2">
            {mode === "signin" ? "Sign in to continue streaming" : "Join Wesu+ and start listening"}
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {error}
          </div>
        )}

        {notice && (
          <div className="mb-4 p-3 rounded-lg bg-primary/10 border border-primary/20 text-primary text-sm">
            {notice}
          </div>
        )}

        <form onSubmit={handleSubmit} onKeyDown={handleKeyDown} className="space-y-4">
          {mode === "signup" && (
            <div>
              <label className="block text-sm font-medium mb-2">Full Name</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  placeholder="Your name"
                  className="w-full bg-card border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-primary/50 text-foreground placeholder:text-muted-foreground"
                />
              </div>
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
                className="w-full bg-card border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-primary/50 text-foreground placeholder:text-muted-foreground"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="Min 6 characters"
                minLength={6}
                className="w-full bg-card border border-white/10 rounded-xl pl-10 pr-10 py-3 text-sm focus:outline-none focus:border-primary/50 text-foreground placeholder:text-muted-foreground"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>
          {mode === "signup" && (
            <TermsConsent
              kind="listener"
              checked={agreedToTerms}
              onCheckedChange={setAgreedToTerms}
              disabled={loading}
            />
          )}
          <button
            type="submit"
            disabled={loading || (mode === "signup" && !agreedToTerms)}
            className="w-full py-3 bg-primary text-obsidian rounded-xl font-bold hover:brightness-110 transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer hover:scale-105"
          >
            {loading ? (
              "Loading..."
            ) : (
              <>
                {mode === "signin" ? "Sign In" : "Create Account"}
                <ArrowRight className="size-4" />
              </>
            )}
          </button>
        </form>

        {!isNative && (
        <>
        <div className="mt-6 relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-white/10" />
          </div>
          <div className="relative flex justify-center text-xs uppercase tracking-wider">
            <span className="bg-obsidian px-2 text-muted-foreground">Or</span>
          </div>
        </div>

        <button
          type="button"
          onClick={async () => {
            // OAuth can create a brand-new account even when the page is still
            // in sign-in mode, so it must not bypass the terms acknowledgement.
            if (!agreedToTerms) {
              setMode("signup");
              setError(
                "Review and agree to the Listener Terms & Conditions before continuing with Google.",
              );
              return;
            }
            setLoading(true);
            try {
              // Keep the intended destination out of the OAuth redirect URI:
              // it must be a public same-origin URL, so stash the path locally.
              try {
                sessionStorage.setItem("post_auth_redirect", safeRedirect || "/dashboard");
              } catch {
                /* storage unavailable — the fallback below still navigates */
              }
              // The OAuth round-trip wipes ?action — stash the full intent so
              // it replays (like/follow/save completes) when the session lands.
              stashPendingAction(
                sessionStorage,
                { action, artistId, itemId, itemType, redirect, invite },
              );
              const result = await lovable.auth.signInWithOAuth("google", {
                redirect_uri: window.location.origin,
              });
              if (result.error) {
                setError(
                  result.error instanceof Error ? result.error.message : "Google sign-in failed",
                );
              }
              if (!result.redirected && !result.error) {
                navigate({ to: (safeRedirect || "/dashboard") as any });
              }
            } catch (err) {
              // A thrown SDK/network error previously left an unhandled
              // rejection and a permanently stuck "Loading…" button.
              setError(err instanceof Error ? err.message : "Google sign-in failed");
            } finally {
              setLoading(false);
            }
          }}
          disabled={loading}
          className="w-full mt-6 py-3 bg-card border border-white/10 rounded-xl font-semibold hover:bg-white/5 transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer hover:scale-105"
        >
          <svg className="size-4" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.19 3.33v2.77h3.55c2.08-1.92 3.28-4.74 3.28-8.11z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.55-2.77c-.98.66-2.23 1.06-3.73 1.06-2.87 0-5.3-1.94-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.86-2.59 3.29-4.53 6.16-4.53z"
            />
          </svg>
          Continue with Google
        </button>
        </>
        )}
        {isNative && (
          <p className="mt-6 text-center text-xs text-muted-foreground">
            Google sign-in lives on the website — in the app, sign in with email.
          </p>
        )}

        <div className="mt-6 text-center space-y-3">
          <button
            onClick={() => {
              setMode(mode === "signin" ? "signup" : "signin");
              setError(null);
              setNotice(null);
            }}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors block w-full cursor-pointer"
          >
            {mode === "signin"
              ? "Don't have an account? Sign up"
              : "Already have an account? Sign in"}
          </button>
          {mode === "signin" && (
            <Link
              to="/forgot-password"
              className="text-sm text-primary hover:brightness-110 transition-colors block cursor-pointer"
            >
              Forgot password?
            </Link>
          )}
        </div>

        <div className="mt-8 pt-6 border-t border-white/5 text-center">
          <Link
            to="/"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
