"use client";

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

export default function CalendarView({ state, onBlockAction }: Props) {
  const goalById = new Map(state.goals.map((g) => [g.id, g]));

  const events = [
    ...state.blocks.map((b) => ({
      id: `block-${b.id}`,
      title: (b.status === "done" ? "✓ " : b.locked ? "📌 " : "") + b.title,
      start: b.start,
      end: b.end,
      backgroundColor:
        b.status === "done"
          ? "#9ca3af"
          : b.status === "skipped"
            ? "#d1d5db"
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
      backgroundColor: "#475569",
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
    const action = window.prompt(
      `"${arg.event.title}"\n\nType one: done / skip / lock / unlock / undo`,
      "done",
    );
    if (!action) return;
    const map: Record<string, { status?: string; locked?: boolean }> = {
      done: { status: "done" },
      skip: { status: "skipped" },
      undo: { status: "planned" },
      lock: { locked: true },
      unlock: { locked: false },
    };
    const patch = map[action.trim().toLowerCase()];
    if (patch) onBlockAction(props.blockId, patch);
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

  return (
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
  );
}
