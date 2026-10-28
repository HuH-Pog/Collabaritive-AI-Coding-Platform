"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type User = {
  id: string;
  name: string;
  email: string;
};

export default function AuthPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");

  const [user, setUser] = useState<User | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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
      } catch (err) {
        if (controller.signal.aborted) return;

        setError(
          err instanceof Error
            ? err.message
            : "Could not connect to the server."
        );
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
      const response = await fetch(
        `${API_URL}/api/auth/${mode}`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ...(mode === "signup" ? { name } : {}),
            email,
            password,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Authentication failed.");
      }

      setUser(data.user);
      setPassword("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Something went wrong."
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
      const response = await fetch(
        `${API_URL}/api/auth/logout`,
        {
          method: "POST",
          credentials: "include",
        }
      );

      if (!response.ok) {
        throw new Error("Could not sign out.");
      }

      setUser(null);
      setPassword("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not sign out."
      );
    } finally {
      setBusy(false);
    }
  }

  if (checkingSession) {
    return <main className="page">Checking your session...</main>;
  }

  return (
    <main className="page">
      <section
        className="room-card"
        style={{
          width: "100%",
          maxWidth: 480,
          margin: "40px auto",
          boxSizing: "border-box",
        }}
      >
        <Link className="brand" href="/">
          ◈ CodeTogether
        </Link>

        {user ? (
          <div style={{ marginTop: 24 }}>
            <p className="eyebrow">YOUR ACCOUNT</p>

            <h1>Welcome, {user.name}</h1>
            <p className="muted">{user.email}</p>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 12,
                marginTop: 24,
              }}
            >
              <Link className="button" href="/">
                Go to home
              </Link>

              <button
                className="button secondary"
                type="button"
                disabled={busy}
                onClick={logout}
              >
                {busy ? "Signing out..." : "Sign out"}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div style={{ marginTop: 24 }}>
              <p className="eyebrow">YOUR CODING SPACE</p>

              <h1>
                {mode === "signup"
                  ? "Create an account"
                  : "Welcome back"}
              </h1>

              <p className="muted">
                {mode === "signup"
                  ? "Create your CodeTogether account."
                  : "Sign in to your CodeTogether account."}
              </p>
            </div>

            <form
              onSubmit={submitAuth}
              style={{
                display: "grid",
                gap: 16,
                marginTop: 24,
              }}
            >
              {mode === "signup" && (
                <label>
                  Name
                  <input
                    className="auth-input"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    autoComplete="name"
                    maxLength={30}
                    required
                  />
                </label>
              )}

              <label>
                Email
                <input
                  className="auth-input"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  maxLength={254}
                  required
                />
              </label>

              <label>
                Password
                <input
                  className="auth-input"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete={
                    mode === "signup"
                      ? "new-password"
                      : "current-password"
                  }
                  minLength={mode === "signup" ? 6 : 1}
                  maxLength={128}
                  required
                />
              </label>

              {mode === "signup" && (
                <p className="muted" style={{ margin: 0 }}>
                  Use at least 12 characters.
                </p>
              )}

              <button
                className="button"
                type="submit"
                disabled={busy}
              >
                {busy
                  ? "Please wait..."
                  : mode === "signup"
                    ? "Create account"
                    : "Sign in"}
              </button>
            </form>

            <p style={{ marginTop: 20 }}>
              {mode === "signup"
                ? "Already have an account? "
                : "New to CodeTogether? "}

              <button
                className="button secondary"
                type="button"
                disabled={busy}
                onClick={() => {
                  setMode(mode === "login" ? "signup" : "login");
                  setPassword("");
                  setError("");
                }}
              >
                {mode === "signup" ? "Sign in" : "Create account"}
              </button>
            </p>

            <Link href="/">Back to home</Link>
          </>
        )}

        {error && (
          <p
            role="alert"
            style={{ color: "#f87171", marginTop: 16 }}
          >
            {error}
          </p>
        )}
      </section>
    </main>
  );
}