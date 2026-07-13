"use client";

import { useCallback, useEffect, useState } from "react";
import CalendarView from "@/components/CalendarView";
import ChatPanel from "@/components/ChatPanel";
import TodayStrip from "@/components/TodayStrip";
import type { AppState } from "@/components/types";

export default function Home() {
  const [state, setState] = useState<AppState | null>(null);

  const refresh = useCallback(() => {
    fetch("/api/state")
      .then((r) => r.json())
      .then(setState)
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const onBlockAction = useCallback(
    async (
      id: number,
      patch: { status?: string; locked?: boolean; start?: string; end?: string },
    ) => {
      await fetch(`/api/blocks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      refresh();
    },
    [refresh],
  );

  return (
    <div className="flex h-screen flex-col bg-white text-slate-900">
      <header className="flex items-center justify-between border-b border-slate-200 px-4 py-2">
        <h1 className="text-lg font-bold">
          🗓️ Planr <span className="text-sm font-normal text-slate-400">— tell it, it plans</span>
        </h1>
        <div className="flex items-center gap-3 text-sm">
          {state?.googleConnected ? (
            <span className="text-emerald-600">● Google Calendar synced</span>
          ) : (
            <a href="/api/google/auth" className="text-indigo-600 hover:underline">
              Connect Google Calendar
            </a>
          )}
        </div>
      </header>
      {state && <TodayStrip state={state} />}
      <main className="flex min-h-0 flex-1">
        <section className="min-w-0 flex-[3] p-3">
          {state ? (
            <CalendarView state={state} onBlockAction={onBlockAction} />
          ) : (
            <div className="flex h-full items-center justify-center text-slate-400">Loading…</div>
          )}
        </section>
        <aside className="flex w-[380px] shrink-0 flex-col border-l border-slate-200">
          <ChatPanel llmProvider={state?.llmProvider ?? "claude-code"} onStateChanged={refresh} />
        </aside>
      </main>
    </div>
  );
}
