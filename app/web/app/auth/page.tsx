"use client";

import { Suspense, useEffect, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Eye,
  EyeOff,
  ArrowRight,
  LogOut,
  AlertCircle,
  FolderCode,
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type User = {
  id: string;
  name: string;
  email: string;
};

function AuthContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo") || searchParams.get("redirect") || "";

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [user, setUser] = useState<User | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Safely check return path: must start with "/" and not "//"
  const safeReturnUrl =
    returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//")
      ? returnTo
      : "/my-rooms";

  useEffect(() => {
    const controller = new AbortController();

    async function loadSession() {
      try {
        const response = await fetch(`${API_URL}/api/auth/me`, {
          credentials: "include",
          cache: "no-store",
          signal: controller.signal,
        });

        if (response.status === 401) return;

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error ?? "Could not check your session.");
        }

        setUser(data.user);
      } catch {
        if (controller.signal.aborted) return;
        // Keep quiet on initial load session check failure unless not aborted
      } finally {
        if (!controller.signal.aborted) {
          setCheckingSession(false);
        }
      }
    }

    loadSession();
    return () => controller.abort();
  }, []);

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    setBusy(true);
    setError("");

    try {
      const response = await fetch(`${API_URL}/api/auth/${mode}`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...(mode === "signup" ? { name: name.trim() } : {}),
          email: email.trim(),
          password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Authentication failed.");
      }

      setUser(data.user);
      setPassword("");

      // On successful login/signup, navigate to returnTo or /my-rooms
      router.push(safeReturnUrl);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Something went wrong during sign in."
      );
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    if (busy) return;

    setBusy(true);
    setError("");

    try {
      const response = await fetch(`${API_URL}/api/auth/logout`, {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Could not sign out.");
      }

      setUser(null);
      setPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign out.");
    } finally {
      setBusy(false);
    }
  }

  if (checkingSession) {
    return (
      <div className="page-container">
        <main className="auth-wrapper">
          <div className="auth-card" style={{ textAlign: "center", color: "var(--text-muted)" }}>
            <p>Checking session status...</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="page-container">
      {/* Authentication Page Header */}
      <header className="landing-header">
        <div className="landing-header-inner">
          <Link href="/" className="brand-badge">
            <span className="brand-icon">◈</span>
            <span className="brand-name">
              Code<span>Together</span>
            </span>
          </Link>

          <Link href="/" className="btn btn-ghost btn-sm">
            ← Back to Home
          </Link>
        </div>
      </header>

      <main className="auth-wrapper">
        <div className="auth-card">
          {user ? (
            /* Signed-In Account Details View */
            <div>
              <div className="auth-header">
                <span className="badge badge-blue" style={{ marginBottom: 12 }}>
                  Active Session
                </span>
                <h1 className="auth-title">Welcome back, {user.name}</h1>
                <p className="auth-subtitle">{user.email}</p>
              </div>

              {error && (
                <div className="alert-box alert-error" role="alert" style={{ marginBottom: 20 }}>
                  <AlertCircle size={16} />
                  <span>{error}</span>
                </div>
              )}

              <div style={{ display: "grid", gap: 12, marginTop: 24 }}>
                <Link href="/my-rooms" className="btn btn-primary btn-lg" style={{ width: "100%" }}>
                  <FolderCode size={16} />
                  Go to My Rooms
                  <ArrowRight size={16} />
                </Link>

                <Link href="/create-room" className="btn btn-secondary btn-lg" style={{ width: "100%" }}>
                  Create a new room
                </Link>

                <button
                  type="button"
                  onClick={logout}
                  disabled={busy}
                  className="btn btn-ghost"
                  style={{ width: "100%", marginTop: 8 }}
                >
                  <LogOut size={15} />
                  {busy ? "Signing out..." : "Sign out"}
                </button>
              </div>
            </div>
          ) : (
            /* Sign In / Sign Up Form View */
            <div>
              <div className="auth-header">
                <h1 className="auth-title">
                  {mode === "login" ? "Sign in to your account" : "Create your account"}
                </h1>
                <p className="auth-subtitle">
                  {mode === "login"
                    ? "Enter your credentials to access your rooms"
                    : "Get started with your collaborative coding workspace"}
                </p>
              </div>

              <div className="auth-mode-switch" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === "login"}
                  className={`auth-mode-btn ${mode === "login" ? "active" : ""}`}
                  onClick={() => {
                    setMode("login");
                    setError("");
                  }}
                >
                  Sign in
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === "signup"}
                  className={`auth-mode-btn ${mode === "signup" ? "active" : ""}`}
                  onClick={() => {
                    setMode("signup");
                    setError("");
                  }}
                >
                  Create account
                </button>
              </div>

              {error && (
                <div className="alert-box alert-error" role="alert" style={{ marginBottom: 20 }}>
                  <AlertCircle size={16} />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={submitAuth} style={{ display: "grid", gap: 16 }}>
                {mode === "signup" && (
                  <div className="form-group">
                    <label className="form-label" htmlFor="user-name">
                      Full name
                    </label>
                    <input
                      id="user-name"
                      type="text"
                      className="form-input"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g., Alex Johnson"
                      autoComplete="name"
                      maxLength={30}
                      required
                    />
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label" htmlFor="user-email">
                    Email address
                  </label>
                  <input
                    id="user-email"
                    type="email"
                    className="form-input"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    autoComplete="email"
                    maxLength={254}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="user-password">
                    Password
                  </label>
                  <div className="password-input-wrapper">
                    <input
                      id="user-password"
                      type={showPassword ? "text" : "password"}
                      className="form-input"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={mode === "signup" ? "At least 6 characters" : "••••••••"}
                      autoComplete={mode === "signup" ? "new-password" : "current-password"}
                      minLength={mode === "signup" ? 6 : 1}
                      maxLength={128}
                      required
                    />
                    <button
                      type="button"
                      className="password-toggle-btn"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {mode === "signup" && (
                    <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                      Use at least 6 characters (12+ recommended).
                    </span>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={busy}
                  className="btn btn-primary btn-lg"
                  style={{ width: "100%", marginTop: 8 }}
                >
                  {busy ? (
                    "Processing..."
                  ) : mode === "signup" ? (
                    <>
                      Create account
                      <ArrowRight size={16} />
                    </>
                  ) : (
                    <>
                      Sign in
                      <ArrowRight size={16} />
                    </>
                  )}
                </button>
              </form>

              <div style={{ marginTop: 24, textAlign: "center", fontSize: 13, color: "var(--text-muted)" }}>
                {mode === "signup" ? (
                  <span>
                    Already have an account?{" "}
                    <button
                      type="button"
                      onClick={() => {
                        setMode("login");
                        setError("");
                      }}
                      style={{ color: "var(--accent-primary)", fontWeight: 600 }}
                    >
                      Sign in here
                    </button>
                  </span>
                ) : (
                  <span>
                    New to CodeTogether?{" "}
                    <button
                      type="button"
                      onClick={() => {
                        setMode("signup");
                        setError("");
                      }}
                      style={{ color: "var(--accent-primary)", fontWeight: 600 }}
                    >
                      Create an account
                    </button>
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense
      fallback={
        <div className="page-container">
          <main className="auth-wrapper">
            <div className="auth-card" style={{ textAlign: "center", color: "var(--text-muted)" }}>
              Loading...
            </div>
          </main>
        </div>
      }
    >
      <AuthContent />
    </Suspense>
  );
}
