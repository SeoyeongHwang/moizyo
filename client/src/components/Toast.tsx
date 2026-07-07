import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

interface ToastContextValue {
  showToast: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState("");
  const timerRef = useRef<number | undefined>(undefined);

  const showToast = useCallback((msg: string) => {
    window.clearTimeout(timerRef.current);
    setMessage(msg);
    timerRef.current = window.setTimeout(() => setMessage(""), 2200);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        style={{
          position: "fixed",
          bottom: 28,
          left: "50%",
          transform: "translateX(-50%)",
          background: "var(--color-surface)",
          border: "1px solid var(--color-hairline)",
          borderRadius: 16,
          padding: "10px 18px",
          fontSize: 14,
          fontWeight: 500,
          boxShadow: "var(--shadow-2)",
          display: message ? "block" : "none",
          zIndex: 60,
          whiteSpace: "nowrap",
        }}
      >
        {message}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
