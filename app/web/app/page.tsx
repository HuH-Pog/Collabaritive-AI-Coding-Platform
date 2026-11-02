"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Code2,
  Terminal,
  Users,
  MessageSquare,
  ShieldCheck,
  ArrowRight,
  Play,
  Sparkles,
  CheckCircle2,
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type User = {
  id: string;
  name: string;
  email: string;
};

export default function HomePage() {
  const [user, setUser] = useState<User | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    async function checkAuth() {
      try {
        const response = await fetch(`${API_URL}/api/auth/me`, {
          credentials: "include",
          cache: "no-store",
          signal: controller.signal,
        });

        if (response.ok) {
          const data = await response.json();
          setUser(data.user ?? null);
        }
      } catch {
        // Unauthenticated or network issue
      } finally {
        if (!controller.signal.aborted) {
          setCheckingAuth(false);
        }
      }
    }

    checkAuth();
    return () => controller.abort();
  }, []);

  return (
    <div className="page-container">
      {/* Public Homepage Navigation Header */}
      <header className="landing-header">
        <div className="landing-header-inner">
          <Link href="/" className="brand-badge">
            <span className="brand-icon">◈</span>
            <span className="brand-name">
              Code<span>Together</span>
            </span>
          </Link>

          <nav className="landing-nav-links" aria-label="Main Navigation">
            <a href="#features" className="landing-nav-link">
              Features
            </a>
            <a href="#preview" className="landing-nav-link">
              Preview
            </a>
            <a href="#how-it-works" className="landing-nav-link">
              How it works
            </a>
          </nav>

          <div className="landing-auth-group">
            {!checkingAuth && user ? (
              <>
                <Link href="/my-rooms" className="btn btn-secondary btn-sm">
                  My rooms
                </Link>
                <Link href="/create-room" className="btn btn-primary btn-sm">
                  Create room
                  <ArrowRight size={14} />
                </Link>
              </>
            ) : (
              <>
                <Link href="/auth" className="btn btn-ghost btn-sm">
                  Sign in
                </Link>
                <Link href="/auth" className="btn btn-primary btn-sm">
                  Get started
                  <ArrowRight size={14} />
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main>
        {/* Hero Section */}
        <section className="hero-section">
          <div className="hero-tag">
            <Sparkles size={14} />
            Real-time collaborative pair programming
          </div>

          <h1 className="hero-title">
            Write code together, <span className="hero-title-highlight">run it</span>, and discuss it in one room.
          </h1>

          <p className="hero-description">
            A focused coding workspace for students, friends, and small teams. Multi-cursor editing powered by CRDTs,
            server-backed execution for JavaScript and Python, and instant room chat.
          </p>

          <div className="hero-cta-group">
            <Link href={user ? "/create-room" : "/auth"} className="btn btn-primary btn-lg">
              Start a coding room
              <ArrowRight size={16} />
            </Link>
            <a href="#preview" className="btn btn-secondary btn-lg">
              Explore workspace
            </a>
          </div>

          <div className="hero-capabilities">
            <span className="hero-capability-item">
              <CheckCircle2 size={15} color="var(--accent-primary)" />
              JavaScript & Python runtime
            </span>
            <span className="hero-capability-item">
              <CheckCircle2 size={15} color="var(--accent-primary)" />
              Zero-latency Yjs cursors
            </span>
            <span className="hero-capability-item">
              <CheckCircle2 size={15} color="var(--accent-primary)" />
              Owner, Editor & Viewer roles
            </span>
            <span className="hero-capability-item">
              <CheckCircle2 size={15} color="var(--accent-primary)" />
              Instant guest invites
            </span>
          </div>
        </section>

        {/* Product Preview Section */}
        <section id="preview" className="product-preview-container">
          <div className="product-preview-window">
            <div className="preview-topbar">
              <div className="preview-topbar-left">
                <div className="preview-window-dots">
                  <div className="preview-dot" style={{ background: "#EF4444" }} />
                  <div className="preview-dot" style={{ background: "#F59E0B" }} />
                  <div className="preview-dot" style={{ background: "#10B981" }} />
                </div>
                <div className="preview-topbar-center">
                  <span>Binary Search & Tree Traversal</span>
                  <span className="badge badge-blue">JavaScript</span>
                  <span className="badge badge-muted">Editor role</span>
                </div>
              </div>

              <div className="preview-topbar-presence">
                <span className="presence-pill" style={{ color: "#2563EB", border: "1px solid #BFDBFE" }}>
                  ● Alex (you)
                </span>
                <span className="presence-pill" style={{ color: "#059669", border: "1px solid #A7F3D0" }}>
                  ● Sarah
                </span>
                <span className="presence-pill" style={{ color: "#D97706", border: "1px solid #FDE68A" }}>
                  ● Marcus (viewer)
                </span>
              </div>
            </div>

            <div className="preview-body">
              <div className="preview-editor-column">
                <div className="preview-code-surface">
                  <span className="code-comment">{"// Collaborative QuickSort Implementation"}</span>
                  <br />
                  <span className="code-keyword">function</span> <span className="code-fn">quickSort</span>(arr) {"{"}
                  <br />
                  &nbsp;&nbsp;<span className="code-keyword">if</span> (arr.length &lt;= <span className="code-number">1</span>) <span className="code-keyword">return</span> arr;
                  <br />
                  &nbsp;&nbsp;<span className="code-keyword">const</span> pivot = arr[arr.length - <span className="code-number">1</span>];
                  <br />
                  &nbsp;&nbsp;<span className="code-keyword">const</span> left = [];
                  <br />
                  &nbsp;&nbsp;<span className="code-keyword">const</span> right = [];
                  <br />
                  <br />
                  &nbsp;&nbsp;<span className="code-comment">{"// Sarah is optimizing the partitioning step:"}</span>
                  <br />
                  &nbsp;&nbsp;<span className="code-keyword">for</span> (<span className="code-keyword">let</span> i = <span className="code-number">0</span>; i &lt; arr.length - <span className="code-number">1</span>; i++) {"{"}
                  <br />
                  &nbsp;&nbsp;&nbsp;&nbsp;<span className="code-keyword">if</span> (arr[i] &lt; pivot) left.push(arr[i]);
                  <br />
                  &nbsp;&nbsp;&nbsp;&nbsp;<span className="code-keyword">else</span> right.push(arr[i]);
                  <br />
                  &nbsp;&nbsp;{"}"}
                  <span
                    className="mock-cursor"
                    style={{ left: 160, top: 228, background: "#60a5fa" }}
                  >
                    <span className="mock-cursor-tag" style={{ background: "#60a5fa" }}>
                      Sarah
                    </span>
                  </span>
                  <br />
                  <br />
                  &nbsp;&nbsp;<span className="code-keyword">return</span> [...<span className="code-fn">quickSort</span>(left), pivot, ...<span className="code-fn">quickSort</span>(right)];
                  <br />
                  {"}"}
                  <br />
                  <br />
                  <span className="code-fn">console</span>.log(<span className="code-fn">quickSort</span>([<span className="code-number">42</span>, <span className="code-number">17</span>, <span className="code-number">93</span>, <span className="code-number">2</span>, <span className="code-number">58</span>]));
                </div>

                <div className="preview-output-drawer">
                  <div className="preview-output-header">
                    <span>OUTPUT (PRIVATE TO RUNNER)</span>
                    <span style={{ color: "#34d399" }}>Exit 0 · 0.04s · 14.1 MB</span>
                  </div>
                  <p className="preview-output-text">
                    [ 2, 17, 42, 58, 93 ]
                  </p>
                </div>
              </div>

              <div className="preview-chat-column">
                <div className="preview-chat-header">
                  <span>Room Chat</span>
                  <span className="badge badge-emerald">● Connected</span>
                </div>

                <div className="preview-chat-messages">
                  <div className="preview-chat-bubble">
                    <div className="preview-chat-meta">
                      <strong style={{ color: "#60a5fa" }}>Sarah</strong>
                      <span style={{ color: "#64748b" }}>10:42 AM</span>
                    </div>
                    <div>Should we handle duplicate pivot elements with a 3-way partition?</div>
                  </div>

                  <div className="preview-chat-bubble">
                    <div className="preview-chat-meta">
                      <strong style={{ color: "#34d399" }}>Alex (you)</strong>
                      <span style={{ color: "#64748b" }}>10:43 AM</span>
                    </div>
                    <div>Good catch. Let&apos;s test standard partition first, execution output is clean.</div>
                  </div>

                  <div className="preview-chat-bubble">
                    <div className="preview-chat-meta">
                      <strong style={{ color: "#f472b6" }}>Marcus</strong>
                      <span style={{ color: "#64748b" }}>10:44 AM</span>
                    </div>
                    <div>Watching along. Looks fast!</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="preview-caption">
            * Illustrative preview of CodeTogether&apos;s synchronized workspace with Monaco editor, multi-user cursors, and real-time room chat.
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="features-section">
          <div className="section-header">
            <div className="section-eyebrow">Engineered for collaboration</div>
            <h2 className="section-title">Everything you need to write and test code together</h2>
            <p className="section-subtitle">
              Built on battle-tested developer tools with no artificial friction.
            </p>
          </div>

          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon-wrapper">
                <Code2 size={22} />
              </div>
              <h3 className="feature-title">Real-time CRDT Editor</h3>
              <p className="feature-desc">
                Monaco Editor paired with Yjs and Hocuspocus. Full conflict-free replicated data types ensure every keystroke, selection, and remote cursor syncs without overwrites.
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-icon-wrapper emerald">
                <Play size={22} />
              </div>
              <h3 className="feature-title">Integrated Execution</h3>
              <p className="feature-desc">
                Run JavaScript and Python code on demand with optional standard input. View execution time, memory usage, stdout, and error output privately without leaving the editor.
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-icon-wrapper">
                <ShieldCheck size={22} />
              </div>
              <h3 className="feature-title">Role-Based Access</h3>
              <p className="feature-desc">
                Owners, Editors, and Viewers. Owners can generate dedicated read-only viewer links so teammates or instructors can follow along in spectator mode while editors collaborate.
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-icon-wrapper emerald">
                <MessageSquare size={22} />
              </div>
              <h3 className="feature-title">Live Room Chat</h3>
              <p className="feature-desc">
                Integrated Socket.IO room chat keeps discussions right alongside your code. Viewers and editors alike can ask questions and discuss ideas with persistent history.
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-icon-wrapper">
                <Users size={22} />
              </div>
              <h3 className="feature-title">Instant Guest Access</h3>
              <p className="feature-desc">
                Share an invite token with teammates or interview candidates. Guests enter their name and jump straight into the room without requiring mandatory account creation.
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-icon-wrapper emerald">
                <Terminal size={22} />
              </div>
              <h3 className="feature-title">Persistent Document Sync</h3>
              <p className="feature-desc">
                Room content persists automatically across sessions. Rejoin at any time, continue where you left off, and access your created rooms from your personal dashboard.
              </p>
            </div>
          </div>
        </section>

        {/* How It Works Section */}
        <section id="how-it-works" className="how-it-works-section">
          <div className="section-header">
            <div className="section-eyebrow">Simple 3-step workflow</div>
            <h2 className="section-title">How CodeTogether works</h2>
            <p className="section-subtitle">
              Jump from an idea to a shared coding session in under 30 seconds.
            </p>
          </div>

          <div className="steps-grid">
            <div className="step-card">
              <span className="step-number">Step 01</span>
              <h3 className="step-title">Create your room</h3>
              <p className="step-desc">
                Name your room and pick your language (JavaScript or Python). Your room is initialized with isolated document storage and an active workspace.
              </p>
            </div>

            <div className="step-card">
              <span className="step-number">Step 02</span>
              <h3 className="step-title">Share the invite link</h3>
              <p className="step-desc">
                Copy the editor invite link for collaborative contributors, or generate an owner-backed read-only viewer link for spectators.
              </p>
            </div>

            <div className="step-card">
              <span className="step-number">Step 03</span>
              <h3 className="step-title">Collaborate, run & discuss</h3>
              <p className="step-desc">
                Watch remote cursors glide in real-time, execute code with custom inputs, inspect runtime statistics, and chat in the side panel.
              </p>
            </div>
          </div>
        </section>

        {/* Call To Action Banner */}
        <section className="landing-cta-banner">
          <h2 style={{ fontSize: 30, fontWeight: 700, margin: "0 0 12px", color: "var(--text-primary)" }}>
            Ready to code together?
          </h2>
          <p style={{ color: "var(--text-secondary)", fontSize: 16, margin: "0 0 28px", maxWidth: 540, marginLeft: "auto", marginRight: "auto" }}>
            Create a room, send a link to a friend or team member, and start writing code collaboratively.
          </p>
          <div style={{ display: "flex", justifyContent: "center", gap: 14 }}>
            <Link href={user ? "/create-room" : "/auth"} className="btn btn-primary btn-lg">
              Create a room now
              <ArrowRight size={16} />
            </Link>
          </div>
        </section>
      </main>

      {/* Public Homepage Footer */}
      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span className="brand-badge">
              <span className="brand-icon">◈</span>
              <span className="brand-name">CodeTogether</span>
            </span>
            <span>· Collaborative coding for students & teams</span>
          </div>

          <div className="footer-links">
            <Link href="/my-rooms" className="footer-link">
              My rooms
            </Link>
            <Link href="/create-room" className="footer-link">
              Create room
            </Link>
            <Link href="/auth" className="footer-link">
              Account
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
