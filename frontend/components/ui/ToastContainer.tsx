"use client";

import { X } from "lucide-react";

import { useToast, type Toast } from "@/state/ToastContext";
import { cx } from "@/lib/utils/cx";

const TONE: Record<NonNullable<Toast["tone"]>, string> = {
  info: "border-brand-200 bg-white text-slate-900",
  success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  warn: "border-amber-200 bg-amber-50 text-amber-900",
};

export function ToastContainer() {
  const { toasts, dismiss } = useToast();
  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={cx(
            "pointer-events-auto flex items-start gap-3 rounded-xl border p-3 shadow-lg",
            TONE[t.tone ?? "info"],
          )}
        >
          <div className="flex-1">
            <p className="text-sm font-medium">{t.message}</p>
            {t.description && (
              <p className="mt-0.5 text-xs text-slate-600">{t.description}</p>
            )}
            {t.actionLabel && t.onAction && (
              <button
                className="mt-2 rounded-md bg-brand-600 px-3 py-1 text-xs font-medium text-white hover:bg-brand-700"
                onClick={() => {
                  t.onAction?.();
                  dismiss(t.id);
                }}
              >
                {t.actionLabel}
              </button>
            )}
          </div>
          <button
            onClick={() => dismiss(t.id)}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Dismiss notification"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
