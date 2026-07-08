import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { timetableScrollFrameStyle } from "../lib/timetable";

type ScrollEdges = {
  left: boolean;
  right: boolean;
};

const edgeOverlayZIndex = 4;
const scrollStepRatio = 0.7;

export function TimetableScrollFrame({ children }: { children: ReactNode }) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [edges, setEdges] = useState<ScrollEdges>({ left: false, right: false });

  const updateEdges = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const maxScrollLeft = el.scrollWidth - el.clientWidth;
    const next = {
      left: el.scrollLeft > 1,
      right: maxScrollLeft - el.scrollLeft > 1,
    };
    setEdges((prev) => (prev.left === next.left && prev.right === next.right ? prev : next));
  }, []);

  useEffect(() => {
    updateEdges();
  });

  const scrollByDirection = useCallback((direction: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({
      left: el.clientWidth * scrollStepRatio * (direction === "left" ? -1 : 1),
      behavior: "smooth",
    });
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    el.addEventListener("scroll", updateEdges, { passive: true });
    window.addEventListener("resize", updateEdges);

    const resizeObserver = new ResizeObserver(updateEdges);
    resizeObserver.observe(el);
    if (el.firstElementChild) resizeObserver.observe(el.firstElementChild);

    updateEdges();

    return () => {
      el.removeEventListener("scroll", updateEdges);
      window.removeEventListener("resize", updateEdges);
      resizeObserver.disconnect();
    };
  }, [updateEdges]);

  return (
    <div style={{ position: "relative", margin: "-8px -2px -2px" }}>
      <div ref={scrollRef} style={{ ...timetableScrollFrameStyle, margin: 0 }}>
        {children}
      </div>
      <div
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: 0,
          width: 52,
          zIndex: edgeOverlayZIndex,
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-start",
          paddingLeft: 6,
          pointerEvents: "none",
          opacity: edges.left ? 1 : 0,
          color: "rgba(52,50,48,0.46)",
          background: "linear-gradient(90deg, var(--color-surface) 0%, var(--color-surface) 18%, rgba(255,255,255,0) 100%)",
          transitionProperty: "opacity",
          transitionDuration: "150ms",
          transitionTimingFunction: "ease-out",
        }}
      >
        <ScrollButton direction="left" disabled={!edges.left} onClick={() => scrollByDirection("left")} />
      </div>
      <div
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          width: 52,
          zIndex: edgeOverlayZIndex,
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          paddingRight: 6,
          pointerEvents: "none",
          opacity: edges.right ? 1 : 0,
          color: "rgba(52,50,48,0.46)",
          background: "linear-gradient(270deg, var(--color-surface) 0%, var(--color-surface) 18%, rgba(255,255,255,0) 100%)",
          transitionProperty: "opacity",
          transitionDuration: "150ms",
          transitionTimingFunction: "ease-out",
        }}
      >
        <ScrollButton direction="right" disabled={!edges.right} onClick={() => scrollByDirection("right")} />
      </div>
    </div>
  );
}

function ScrollButton({
  direction,
  disabled,
  onClick,
}: {
  direction: "left" | "right";
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={direction === "left" ? "왼쪽으로 스크롤" : "오른쪽으로 스크롤"}
      disabled={disabled}
      onClick={onClick}
      style={{
        width: 36,
        height: 36,
        borderRadius: "var(--radius-full)",
        border: "none",
        padding: 0,
        background: "rgba(255,255,255,0.74)",
        boxShadow: "0 1px 6px rgba(0,0,0,0.12)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flex: "none",
        backdropFilter: "blur(6px)",
        color: "inherit",
        cursor: disabled ? "default" : "pointer",
        pointerEvents: disabled ? "none" : "auto",
      }}
    >
      <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ width: 18, height: 18, display: "block" }}>
        <path
          d={direction === "left" ? "M9.8 3.8 5.6 8l4.2 4.2" : "M6.2 3.8 10.4 8l-4.2 4.2"}
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
