"use client";

import { useCallback, useEffect, useState } from "react";
import CalendarView from "@/components/CalendarView";
import ChatPanel from "@/components/ChatPanel";
import SettingsModal from "@/components/SettingsModal";
import TodayStrip from "@/components/TodayStrip";
import type { AppState } from "@/components/types";

export default function Home() {
  const [state, setState] = useState<AppState | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

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
    <div className="flex h-screen flex-col bg-[--background] text-stone-900">
      <header className="flex items-center justify-between border-b border-stone-200 bg-white px-5 py-2.5">
        <div className="flex items-center gap-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-stone-900 text-sm text-white">
            🗓️
          </span>
          <div className="leading-tight">
            <h1 className="text-[0.95rem] font-bold tracking-tight">Planr</h1>
            <p className="text-[0.65rem] text-stone-400">tell it — it plans</p>
          </div>
          {state && state.goals.length > 0 && (
            <div className="ml-4 hidden items-center gap-2 md:flex">
              {state.goals.map((g) => (
                <span
                  key={g.id}
                  className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-stone-50 px-2.5 py-0.5 text-xs text-stone-600"
                >
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: g.color }} />
                  {g.name}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 text-sm">
          {state?.googleConnected ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Google synced
            </span>
          ) : (
            <a
              href="/api/google/auth"
              className="rounded-full border border-stone-300 px-3 py-1 text-xs font-medium text-stone-600 transition hover:border-stone-400 hover:text-stone-900"
            >
              Connect Google Calendar
            </a>
          )}
          <button
            onClick={() => setSettingsOpen(true)}
            title="AI provider settings"
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
              state && !state.llmReady
                ? "animate-pulse border-amber-300 bg-amber-50 text-amber-700"
                : "border-stone-300 text-stone-600 hover:border-stone-400 hover:text-stone-900"
            }`}
          >
            ⚙️ {state && !state.llmReady ? "Set up AI" : "Settings"}
          </button>
        </div>
      </header>
      {settingsOpen && (
        <SettingsModal onClose={() => setSettingsOpen(false)} onSaved={refresh} />
      )}
      {state && <TodayStrip state={state} />}
      <main className="flex min-h-0 flex-1">
        <section className="min-w-0 flex-[3] p-4">
          {state ? (
            <CalendarView state={state} onBlockAction={onBlockAction} />
          ) : (
            <div className="flex h-full items-center justify-center text-stone-400">Loading…</div>
          )}
        </section>
        <aside className="flex w-[390px] shrink-0 flex-col border-l border-stone-200">
          <ChatPanel
            llmProvider={state?.llmProvider ?? null}
            llmReady={state?.llmReady ?? true}
            onOpenSettings={() => setSettingsOpen(true)}
            onStateChanged={refresh}
          />
        </aside>
      </main>
    </div>
  );
}
