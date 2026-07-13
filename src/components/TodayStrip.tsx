"use client";

import type { AppState } from "./types";

function fmt(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function TodayStrip({ state }: { state: AppState }) {
  const goalById = new Map(state.goals.map((g) => [g.id, g]));
  const today = new Date().toDateString();

  const items = [
    ...state.blocks
      .filter((b) => new Date(b.start).toDateString() === today && b.status !== "skipped")
      .map((b) => ({
        key: `b${b.id}`,
        title: b.title,
        start: b.start,
        end: b.end,
        color: goalById.get(b.goalId)?.color ?? "#6366f1",
        done: b.status === "done",
        fixed: false,
      })),
    ...state.fixedEvents
      .filter((e) => new Date(e.start).toDateString() === today)
      .map((e) => ({
        key: `f${e.id}`,
        title: e.title,
        start: e.start,
        end: e.end,
        color: "#475569",
        done: false,
        fixed: true,
      })),
  ].sort((a, b) => a.start.localeCompare(b.start));

  if (items.length === 0) {
    return (
      <div className="border-b border-slate-200 px-4 py-2 text-sm text-slate-400">
        Nothing planned today — tell the chat what you're working on.
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 overflow-x-auto border-b border-slate-200 px-4 py-2">
      <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-400">
        Today
      </span>
      {items.map((it) => (
        <span
          key={it.key}
          className={`shrink-0 rounded-full px-3 py-1 text-xs text-white ${it.done ? "opacity-40 line-through" : ""}`}
          style={{ backgroundColor: it.color }}
          title={it.title}
        >
          {fmt(it.start)} {it.fixed ? "🔒 " : ""}
          {it.title.length > 34 ? it.title.slice(0, 34) + "…" : it.title}
        </span>
      ))}
    </div>
  );
}
