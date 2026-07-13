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

Then adjust anytime: "It's my gf's birthday — I'm out from 5:30pm for ~4 hrs" or "Exams on 15th, 17th, 20th from 1-3pm".`;

export default function ChatPanel({ llmProvider, onStateChanged }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/chat")
      .then((r) => r.json())
      .then((d) => setMessages(d.messages ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

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
        body: JSON.stringify({ message: text }),
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
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {llmProvider === null && (
          <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
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
        {llmProvider === "claude-code" && messages.length === 0 && (
          <div className="rounded-lg bg-emerald-50 p-2 text-xs text-emerald-700">
            Powered by your Claude Code subscription — replies take a few extra seconds.
          </div>
        )}
        {messages.length === 0 && (
          <div className="whitespace-pre-wrap rounded-lg bg-slate-100 p-3 text-sm text-slate-700">
            {WELCOME}
          </div>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={
              m.role === "user"
                ? "ml-6 rounded-lg bg-indigo-600 p-3 text-sm text-white"
                : "mr-6 rounded-lg bg-slate-100 p-3 text-sm text-slate-800"
            }
          >
            <div className="whitespace-pre-wrap">{m.content}</div>
            {m.applied && m.applied.length > 0 && (
              <ul className="mt-2 border-t border-slate-300 pt-2 text-xs text-slate-500">
                {m.applied.map((a, i) => (
                  <li key={i}>• {a}</li>
                ))}
                {m.summary && (
                  <li className="mt-1 font-medium">
                    📅 {m.summary.created} blocks added, {m.summary.removed} moved/removed
                  </li>
                )}
              </ul>
            )}
          </div>
        ))}
        {busy && <div className="mr-6 animate-pulse rounded-lg bg-slate-100 p-3 text-sm">Planning…</div>}
        <div ref={bottomRef} />
      </div>
      <div className="flex gap-2 border-t border-slate-200 p-3">
        <textarea
          className="max-h-32 flex-1 resize-none rounded-lg border border-slate-300 p-2 text-sm focus:border-indigo-500 focus:outline-none"
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
        <button
          onClick={send}
          disabled={busy || !input.trim()}
          className="rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white disabled:opacity-40"
        >
          Send
        </button>
      </div>
    </div>
  );
}
