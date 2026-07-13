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
        color: "#44403c",
        done: false,
        fixed: true,
      })),
  ].sort((a, b) => a.start.localeCompare(b.start));

  const doneCount = items.filter((i) => i.done).length;

  if (items.length === 0) {
    return (
      <div className="border-b border-stone-200 bg-white px-5 py-2.5 text-sm text-stone-400">
        Nothing planned today — tell the chat what you&apos;re working on.
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 overflow-x-auto border-b border-stone-200 bg-white px-5 py-2.5">
      <span className="shrink-0 text-[0.65rem] font-bold uppercase tracking-widest text-stone-400">
        Today
      </span>
      <span className="shrink-0 rounded-full bg-stone-100 px-2 py-0.5 text-[0.65rem] font-semibold text-stone-500">
        {doneCount}/{items.filter((i) => !i.fixed).length} done
      </span>
      <span className="mx-1 h-4 w-px shrink-0 bg-stone-200" />
      {items.map((it) => (
        <span
          key={it.key}
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${
            it.done ? "border-stone-200 bg-stone-50 text-stone-400 line-through" : "border-transparent text-white"
          }`}
          style={it.done ? undefined : { backgroundColor: it.color }}
          title={it.title}
        >
          <span className={it.done ? "" : "opacity-80"}>{fmt(it.start)}</span>
          {it.fixed && "🔒"}
          {it.title.length > 32 ? it.title.slice(0, 32) + "…" : it.title}
        </span>
      ))}
    </div>
  );
}
