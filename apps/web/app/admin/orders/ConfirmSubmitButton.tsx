"use client";

import type { ReactNode } from "react";

/** Geri dönüşü zor işlemler için tarayıcı onayı isteyen gönder düğmesi. */
export function ConfirmSubmitButton({ message, className, children }: { message: string; className?: string; children: ReactNode }) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(event) => {
        if (!window.confirm(message)) event.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
