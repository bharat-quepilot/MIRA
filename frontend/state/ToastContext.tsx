"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

export interface Toast {
  id: string;
  message: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  durationMs?: number; // 0 = sticky
  tone?: "info" | "success" | "warn";
}

interface ToastCtx {
  toasts: Toast[];
  push: (t: Omit<Toast, "id">) => string;
  dismiss: (id: string) => void;
}

const Ctx = createContext<ToastCtx | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (t: Omit<Toast, "id">) => {
      const id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `t-${Date.now()}-${Math.random()}`;
      const toast: Toast = { id, durationMs: 30000, tone: "info", ...t };
      setToasts((prev) => [...prev, toast]);
      if (toast.durationMs && toast.durationMs > 0) {
        const handle = setTimeout(() => dismiss(id), toast.durationMs);
        timersRef.current.set(id, handle);
      }
      return id;
    },
    [dismiss],
  );

  useEffect(() => {
    return () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current.clear();
    };
  }, []);

  return (
    <Ctx.Provider value={{ toasts, push, dismiss }}>{children}</Ctx.Provider>
  );
}

export function useToast(): ToastCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
