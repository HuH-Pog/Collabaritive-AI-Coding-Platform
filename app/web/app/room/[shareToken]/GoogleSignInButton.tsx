"use client";

import { useRef, useState } from "react";
import {
  GoogleLogin,
  GoogleOAuthProvider,
} from "@react-oauth/google";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const GOOGLE_CLIENT_ID =
  process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";

function GoogleSignInContent() {
  const busyRef = useRef(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pendingCredential, setPendingCredential] = useState("");
  const [password, setPassword] = useState("");

  async function signIn(
    credential: string,
    existingPassword?: string
  ) {
    if (busyRef.current) return;

    busyRef.current = true;
    setBusy(true);
    setError("");

    try {
      const response = await fetch(`${API_URL}/api/auth/google`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          credential,
          ...(existingPassword
            ? { password: existingPassword }
            : {}),
        }),
      });

      const data = await response.json();

      if (
        response.status === 409 &&
        data.code === "GOOGLE_LINK_REQUIRED"
      ) {
        setPendingCredential(credential);
        setPassword("");
        return;
      }

      if (!response.ok) {
        throw new Error(data.error ?? "Google sign-in failed.");
      }

      // Full navigation reloads the existing auth/session state.
      window.location.assign("/my-rooms");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Google sign-in failed."
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <div aria-busy={busy}>
      {!pendingCredential ? (
        <div
          style={{
            pointerEvents: busy ? "none" : "auto",
            opacity: busy ? 0.6 : 1,
          }}
        >
          <GoogleLogin
            theme="outline"
            size="large"
            text="continue_with"
            shape="rectangular"
            onSuccess={(response) => {
              if (!response.credential) {
                setError("Google did not return a sign-in credential.");
                return;
              }

              void signIn(response.credential);
            }}
            onError={() => {
              setError("Google sign-in failed. Please try again.");
            }}
          />
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          <p style={{ margin: 0, fontSize: 13 }}>
            An account with this email already exists.
            Enter its password once to link Google and keep
            your existing rooms.
          </p>

          <label htmlFor="google-link-password">
            Existing account password
          </label>

          <input
            id="google-link-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            maxLength={128}
            disabled={busy}
            style={{
              padding: 10,
              borderRadius: 6,
              border: "1px solid currentColor",
              background: "transparent",
              color: "inherit",
              font: "inherit",
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();

                if (password) {
                  void signIn(pendingCredential, password);
                }
              }
            }}
          />

          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || !password}
            onClick={() => void signIn(pendingCredential, password)}
          >
            {busy ? "Linking…" : "Link Google and sign in"}
          </button>

          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => {
              setPendingCredential("");
              setPassword("");
              setError("");
            }}
          >
            Choose another Google account
          </button>
        </div>
      )}

      {busy && <p role="status">Signing in…</p>}

      {error && (
        <p
          role="alert"
          style={{ color: "#ef4444", fontSize: 13 }}
        >
          {error}
        </p>
      )}
    </div>
  );
}

export default function GoogleSignInButton() {
  if (!GOOGLE_CLIENT_ID) {
    return (
      <p role="alert">
        Google sign-in is not configured in the frontend.
      </p>
    );
  }

  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <GoogleSignInContent />
    </GoogleOAuthProvider>
  );
}