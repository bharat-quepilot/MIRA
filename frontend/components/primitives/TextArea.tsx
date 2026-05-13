"use client";

import type { TextareaHTMLAttributes } from "react";
import { cx } from "@/lib/utils/cx";

interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  maxLengthHint?: number;
}

export function TextArea({
  label,
  maxLengthHint,
  className,
  value,
  ...props
}: TextAreaProps) {
  const currentLength = typeof value === "string" ? value.length : 0;
  return (
    <label className="flex flex-col gap-2">
      {label && (
        <span className="text-sm font-medium text-slate-700">{label}</span>
      )}
      <textarea
        className={cx(
          "min-h-[260px] w-full rounded-lg border border-slate-300 bg-white p-3 text-sm shadow-sm",
          "focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30",
          "placeholder:text-slate-400",
          className,
        )}
        value={value}
        {...props}
      />
      {typeof maxLengthHint === "number" && (
        <span
          className={cx(
            "self-end text-xs",
            currentLength > maxLengthHint ? "text-rose-600" : "text-slate-500",
          )}
        >
          {currentLength.toLocaleString()} / {maxLengthHint.toLocaleString()} chars
        </span>
      )}
    </label>
  );
}
