"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "./types";

interface Props {
  llmProvider: "gemini" | "claude-code" | null;
  onStateChanged: () => void;
}

const WELCOME = `Hi! Tell me about your goals, sleep, and commitments — I'll plan your calendar.

Try something like:
"I want 7-8 hrs sleep, dropping to 6 on heavy days. GATE exam is the first week of Feb 2027 — add daily subject blocks from now till then, learning first, then tons of questions. I also do DSA, research work, and my final-year project."

Then adjust anytime: "It's my friend's birthday — I'm out from 5:30pm for ~4 hrs" or "Exams on 15th, 17th, 20th from 1-3pm".`;

const MODELS = [
  { id: "haiku", label: "Haiku · fastest" },
  { id: "sonnet", label: "Sonnet · balanced" },
  { id: "opus", label: "Opus · smartest" },
] as const;

export default function ChatPanel({ llmProvider, onStateChanged }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [model, setModel] = useState<string>("sonnet");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem("planr-model");
    if (saved && MODELS.some((m) => m.id === saved)) setModel(saved);
    fetch("/api/chat")
      .then((r) => r.json())
      .then((d) => setMessages(d.messages ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  function pickModel(id: string) {
    setModel(id);
    localStorage.setItem("planr-model", id);
  }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setBusy(true);
    setMessages((m) => [...m, { id: Date.now(), role: "user", content: text }]);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, model }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessages((m) => [
          ...m,
          { id: Date.now() + 1, role: "assistant", content: `⚠️ ${data.error}` },
        ]);
      } else {
        setMessages((m) => [
          ...m,
          {
            id: Date.now() + 1,
            role: "assistant",
            content: data.reply,
            applied: data.applied,
            summary: data.summary,
          },
        ]);
        if (data.summary) onStateChanged();
      }
    } catch {
      setMessages((m) => [
        ...m,
        { id: Date.now() + 1, role: "assistant", content: "⚠️ Network error — is the server running?" },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {llmProvider === null && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <strong>Setup needed:</strong> either install{" "}
            <a className="underline" href="https://claude.com/claude-code" target="_blank">
              Claude Code
            </a>{" "}
            (uses your subscription, no key needed) or get a free Gemini key at{" "}
            <a className="underline" href="https://aistudio.google.com/apikey" target="_blank">
              aistudio.google.com/apikey
            </a>{" "}
            and put it in <code>.env.local</code> as <code>GEMINI_API_KEY=...</code>. Restart the
            dev server after.
          </div>
        )}
        {messages.length === 0 && (
          <div className="whitespace-pre-wrap rounded-xl border border-stone-200 bg-stone-50 p-4 text-sm leading-relaxed text-stone-600">
            {WELCOME}
          </div>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={
              m.role === "user"
                ? "ml-8 rounded-2xl rounded-br-md bg-stone-900 px-4 py-2.5 text-sm leading-relaxed text-stone-50"
                : "mr-8 rounded-2xl rounded-bl-md border border-stone-200 bg-white px-4 py-2.5 text-sm leading-relaxed text-stone-800 shadow-sm"
            }
          >
            <div className="whitespace-pre-wrap">{m.content}</div>
            {m.applied && m.applied.length > 0 && (
              <div className="mt-2.5 border-t border-stone-100 pt-2">
                <ul className="space-y-0.5 text-xs text-stone-500">
                  {m.applied.map((a, i) => (
                    <li key={i}>· {a}</li>
                  ))}
                </ul>
                {m.summary && (
                  <div className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700">
                    📅 {m.summary.created} added · {m.summary.removed} moved
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        {busy && (
          <div className="mr-8 flex items-center gap-2 rounded-2xl rounded-bl-md border border-stone-200 bg-white px-4 py-2.5 text-sm text-stone-400 shadow-sm">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-indigo-500" />
            Planning…
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <div className="border-t border-stone-200 p-3">
        <div className="rounded-2xl border border-stone-300 bg-white shadow-sm transition focus-within:border-stone-400">
          <textarea
            className="max-h-32 w-full resize-none rounded-t-2xl bg-transparent px-3.5 pt-3 pb-1 text-sm focus:outline-none"
            rows={2}
            placeholder="Tell me what's on your plate…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          <div className="flex items-center justify-between px-2.5 pb-2">
            {llmProvider === "claude-code" ? (
              <select
                value={model}
                onChange={(e) => pickModel(e.target.value)}
                className="rounded-lg border border-stone-200 bg-stone-50 px-2 py-1 text-xs text-stone-600 focus:outline-none"
                title="Claude model used for planning (via your Claude Code subscription)"
              >
                {MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            ) : (
              <span className="px-1 text-xs text-stone-400">
                {llmProvider === "gemini" ? "Gemini 2.5 Flash" : ""}
              </span>
            )}
            <button
              onClick={send}
              disabled={busy || !input.trim()}
              className="rounded-xl bg-stone-900 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-stone-700 disabled:opacity-30"
            >
              Send ↵
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
