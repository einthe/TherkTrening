"use client";
import { useState } from "react";
import { PaletteSelector } from "./palette-selector";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Activity, ArrowUpRight, Clock3 } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { registrationSchema } from "@/lib/domain/events";
export function Brand() {
  return (
    <span className="brand">
      <span className="brand-mark">
        <Activity size={23} strokeWidth={2.5} />
      </span>
      <span>
        Therk<span className="brand-light">Trening</span>
      </span>
    </span>
  );
}
export function AuthForm({ configured }: { configured: boolean }) {
  const router = useRouter();
  const [signup, setSignup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(e.currentTarget);
    try {
      const email = String(data.get("email"));
      const password = String(data.get("password"));
      const db = supabaseBrowser();
      if (signup) {
        const input = registrationSchema.parse({
          email,
          password,
          username: data.get("username"),
        });
        const { data: result, error } = await db.auth.signUp({
          email,
          password,
          options: {
            data: { username: input.username },
            emailRedirectTo: `${window.location.origin}/auth/confirm`,
          },
        });
        if (error)
          throw new Error(
            "Could not create your account. Check your details or try a different username.",
          );
        if (result.session) {
          router.push("/");
          router.refresh();
        } else
          setMessage(
            "Check your email to confirm your account. Your account will then wait for admin approval.",
          );
      } else {
        const { error } = await db.auth.signInWithPassword({ email, password });
        if (error)
          throw new Error("Unable to sign in. Check your email and password.");
        {
          router.push("/");
          router.refresh();
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-page">
      <div className="auth-story">
        <div className="auth-brand-row">
          <Brand />
          <PaletteSelector />
        </div>
        <div className="auth-art" aria-hidden="true">
          <Activity size={190} strokeWidth={0.7} />
        </div>
      </div>
      <div className="auth-form-wrap">
        <div className="auth-form">
          <h1>{signup ? "Create account" : "Sign in"}</h1>
          {!configured ? (
            <div className="notice">
              Supabase isn’t connected yet. You can explore the app with a local
              demo below.
            </div>
          ) : (
            <form onSubmit={submit}>
              {signup && (
                <label>
                  Username
                  <input
                    name="username"
                    required
                    pattern="[a-zA-Z0-9_]{3,30}"
                    autoComplete="username"
                  />
                </label>
              )}
              <label>
                Email address
                <input
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                />
              </label>
              <label>
                Password
                <input
                  name="password"
                  type="password"
                  minLength={8}
                  required
                  autoComplete={signup ? "new-password" : "current-password"}
                />
              </label>
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              {message && (
                <p className="notice" role="status">
                  {message}
                </p>
              )}
              <button className="button primary full" disabled={busy}>
                {busy ? "Please wait…" : signup ? "Create account" : "Sign in"}
                <ArrowUpRight size={17} />
              </button>
              <button
                type="button"
                className="text-button full"
                onClick={() => {
                  setSignup(!signup);
                  setError("");
                  setMessage("");
                }}
              >
                {signup
                  ? "Already have an account? Sign in"
                  : "New here? Create an account"}
              </button>
            </form>
          )}
          <Link className="demo-link" href="/demo">
            Explore the demo <ArrowUpRight size={15} />
          </Link>
          <p className="micro">New accounts require administrator approval.</p>
        </div>
      </div>
    </main>
  );
}
export function AccountStatus({ status }: { status: string }) {
  const router = useRouter();
  return (
    <main className="status-page">
      <div className="auth-brand-row">
        <Brand />
        <PaletteSelector />
      </div>
      <div className="status-card">
        <Clock3 size={36} />
        <h1>
          {status === "pending"
            ? "Pending approval"
            : "Your account is unavailable."}
        </h1>
        <p>
          {status === "pending"
            ? "Your account is waiting for administrator approval."
            : `Your account has been ${status}. Contact the administrator if you think this is a mistake.`}
        </p>
        <button
          className="button primary"
          onClick={() => window.location.reload()}
        >
          Check status
        </button>
        <button
          className="button secondary"
          onClick={async () => {
            await supabaseBrowser().auth.signOut();
            router.push("/login");
            router.refresh();
          }}
        >
          Sign out
        </button>
      </div>
    </main>
  );
}
