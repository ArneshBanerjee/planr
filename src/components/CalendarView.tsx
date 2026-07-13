"use client";

import { useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import type { EventClickArg, EventDropArg } from "@fullcalendar/core";
import type { EventResizeDoneArg } from "@fullcalendar/interaction";
import type { AppState } from "./types";

interface Props {
  state: AppState;
  onBlockAction: (
    id: number,
    patch: { status?: string; locked?: boolean; start?: string; end?: string },
  ) => void;
}

interface Popover {
  blockId: number;
  title: string;
  status: string;
  locked: boolean;
  x: number;
  y: number;
}

export default function CalendarView({ state, onBlockAction }: Props) {
  const [popover, setPopover] = useState<Popover | null>(null);
  const goalById = new Map(state.goals.map((g) => [g.id, g]));

  const events = [
    ...state.blocks.map((b) => ({
      id: `block-${b.id}`,
      title: (b.status === "done" ? "✓ " : b.locked ? "📌 " : "") + b.title,
      start: b.start,
      end: b.end,
      backgroundColor:
        b.status === "done"
          ? "#a8a29e"
          : b.status === "skipped"
            ? "#d6d3d1"
            : (goalById.get(b.goalId)?.color ?? "#6366f1"),
      borderColor: "transparent",
      editable: b.status === "planned",
      extendedProps: { kind: "block", blockId: b.id, status: b.status, locked: b.locked },
    })),
    ...state.fixedEvents.map((e) => ({
      id: `fixed-${e.id}`,
      title: `🔒 ${e.title}`,
      start: e.start,
      end: e.end,
      backgroundColor: "#44403c",
      borderColor: "transparent",
      editable: false,
      extendedProps: { kind: "fixed" },
    })),
  ];

  function handleClick(arg: EventClickArg) {
    const props = arg.event.extendedProps as {
      kind: string;
      blockId?: number;
      status?: string;
      locked?: boolean;
    };
    if (props.kind !== "block" || props.blockId === undefined) return;
    arg.jsEvent.preventDefault();
    setPopover({
      blockId: props.blockId,
      title: arg.event.title,
      status: props.status ?? "planned",
      locked: props.locked ?? false,
      x: Math.min(arg.jsEvent.clientX, window.innerWidth - 230),
      y: Math.min(arg.jsEvent.clientY, window.innerHeight - 220),
    });
  }

  function handleMove(arg: EventDropArg | EventResizeDoneArg) {
    const props = arg.event.extendedProps as { kind: string; blockId?: number };
    if (props.kind !== "block" || props.blockId === undefined || !arg.event.start || !arg.event.end) {
      arg.revert();
      return;
    }
    onBlockAction(props.blockId, {
      start: arg.event.start.toISOString(),
      end: arg.event.end.toISOString(),
    });
  }

  function act(patch: { status?: string; locked?: boolean }) {
    if (popover) onBlockAction(popover.blockId, patch);
    setPopover(null);
  }

  const menuBtn =
    "flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm text-stone-700 hover:bg-stone-100";

  return (
    <div className="relative h-full">
      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView="timeGridWeek"
        headerToolbar={{
          left: "prev,next today",
          center: "title",
          right: "timeGridDay,timeGridWeek,dayGridMonth",
        }}
        height="100%"
        nowIndicator
        scrollTime="08:00:00"
        slotMinTime="06:00:00"
        events={events}
        editable
        eventClick={handleClick}
        eventDrop={handleMove}
        eventResize={handleMove}
      />
      {popover && (
        <>
          {/* click-away backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setPopover(null)} />
          <div
            className="fixed z-50 w-56 rounded-xl border border-stone-200 bg-white p-1.5 shadow-xl"
            style={{ left: popover.x, top: popover.y }}
          >
            <div className="truncate px-3 py-1.5 text-xs font-semibold text-stone-500">
              {popover.title}
            </div>
            {popover.status !== "done" && (
              <button className={menuBtn} onClick={() => act({ status: "done" })}>
                ✅ Mark done
              </button>
            )}
            {popover.status === "done" && (
              <button className={menuBtn} onClick={() => act({ status: "planned" })}>
                ↩️ Undo done
              </button>
            )}
            {popover.status !== "skipped" && (
              <button className={menuBtn} onClick={() => act({ status: "skipped" })}>
                ⏭️ Skip (re-plan around it)
              </button>
            )}
            {popover.locked ? (
              <button className={menuBtn} onClick={() => act({ locked: false })}>
                🔓 Unpin
              </button>
            ) : (
              <button className={menuBtn} onClick={() => act({ locked: true })}>
                📌 Pin in place
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
