"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export default function HomePage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [language, setLanguage] = useState("javascript");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function createRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/rooms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, language }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Could not create the room.");
      }

      if (!data.shareToken) {
        throw new Error("The API response did not include a share token.");
      }

      router.push(`/room/${encodeURIComponent(data.shareToken)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page">
      <section className="card">
        <div className="brand">◈ CodeTogether</div>
        <p className="eyebrow">COLLABORATIVE CODING</p>
        <h1>Start a coding room</h1>
        <p className="muted">
          Create a room, choose a language, and invite someone to join.
        </p>

        <form className="form" onSubmit={createRoom}>
          <label htmlFor="name">Room name</label>
          <input
            id="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="For example, DSA practice"
            maxLength={80}
            required
          />

          <label htmlFor="language">Programming language</label>
          <select
            id="language"
            value={language}
            onChange={(event) => setLanguage(event.target.value)}
          >
            <option value="javascript">JavaScript</option>
            <option value="python">Python</option>
          </select>

          {error && <p className="error">{error}</p>}

          <button className="button" type="submit" disabled={loading}>
            {loading ? "Creating room..." : "Create room"}
          </button>
        </form>
      </section>
    </main>
  );
}