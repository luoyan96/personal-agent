import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";

const STORAGE_KEY = "acceptcat.chat.sidebar-width";
export const DEFAULT_CONVERSATION_WIDTH = 248;
const MIN_WIDTH = 220;
const MAX_WIDTH = 480;
const MIN_CHAT_WIDTH = 360;

export function clampConversationWidth(width: number, available = Infinity) {
  const maximum = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, available - MIN_CHAT_WIDTH));
  return Math.round(
    Math.max(
      MIN_WIDTH,
      Math.min(maximum, Number.isFinite(width) ? width : DEFAULT_CONVERSATION_WIDTH),
    ),
  );
}

function savedWidth() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved?.trim()
      ? clampConversationWidth(Number(saved))
      : DEFAULT_CONVERSATION_WIDTH;
  } catch {
    return DEFAULT_CONVERSATION_WIDTH;
  }
}

export function useConversationWidth(enabled: boolean) {
  const columnRef = useRef<HTMLDivElement>(null);
  const [preferredWidth, setPreferredWidth] = useState(savedWidth);
  const [available, setAvailable] = useState(Infinity);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ pointerId: number; x: number; width: number }>();
  const latestWidth = useRef(preferredWidth);
  const width = clampConversationWidth(preferredWidth, available);
  const maximum = clampConversationWidth(MAX_WIDTH, available);

  useEffect(() => {
    const parent = columnRef.current?.parentElement;
    if (!enabled || !parent) return;
    const observer = new ResizeObserver(() => setAvailable(parent.clientWidth));
    setAvailable(parent.clientWidth);
    observer.observe(parent);
    return () => observer.disconnect();
  }, [enabled]);

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, String(latestWidth.current));
    } catch {
      /* Resizing still works without storage. */
    }
  }
  function update(next: number) {
    latestWidth.current = clampConversationWidth(next, available);
    setPreferredWidth(latestWidth.current);
  }
  function finish(event: PointerEvent<HTMLDivElement>) {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = undefined;
    setDragging(false);
    persist();
  }
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    let next: number;
    switch (event.key) {
      case "ArrowLeft":
        next = width - 16;
        break;
      case "ArrowRight":
        next = width + 16;
        break;
      case "Home":
        next = MIN_WIDTH;
        break;
      case "End":
        next = maximum;
        break;
      default:
        return;
    }
    event.preventDefault();
    update(next);
    persist();
  }

  return {
    columnRef,
    width,
    dragging,
    separatorProps: {
      role: "separator" as const,
      tabIndex: 0,
      "aria-label": "调整聊天列表宽度",
      "aria-orientation": "vertical" as const,
      "aria-valuemin": MIN_WIDTH,
      "aria-valuemax": maximum,
      "aria-valuenow": width,
      title: "左右拖动调整聊天列表宽度，双击恢复默认",
      onPointerDown(event: PointerEvent<HTMLDivElement>) {
        if (event.button !== 0 || drag.current) return;
        event.preventDefault();
        event.currentTarget.focus();
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { pointerId: event.pointerId, x: event.clientX, width };
        setDragging(true);
      },
      onPointerMove(event: PointerEvent<HTMLDivElement>) {
        if (drag.current?.pointerId === event.pointerId) {
          update(drag.current.width + event.clientX - drag.current.x);
        }
      },
      onPointerUp: finish,
      onPointerCancel: finish,
      onLostPointerCapture: finish,
      onKeyDown,
      onDoubleClick() {
        update(DEFAULT_CONVERSATION_WIDTH);
        persist();
      },
    },
  };
}
