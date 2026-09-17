"use client";
import { useState, useTransition, type ReactNode } from "react";
import { submitDealerApplicationAction } from "./actions";

/** Keeps all entered values when server validation fails; prevents double submission. */
export function ApplicationForm({ children }: { children: ReactNode }) {
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="applicationForm"
      aria-busy={pending}
      onSubmit={(event) => {
        event.preventDefault();
        if (pending) return;
        const data = new FormData(event.currentTarget);
        setError("");
        startTransition(async () => {
          const result = await submitDealerApplicationAction(data);
          setError(result.error);
        });
      }}
    >
      {error ? (
        <p className="formError spanTwo" role="alert">
          {error}
        </p>
      ) : null}
      {pending ? (
        <p className="spanTwo" role="status">
          Başvurunuz kaydediliyor…
        </p>
      ) : null}
      <fieldset className="applicationFormBody" disabled={pending}>
        {children}
      </fieldset>
    </form>
  );
}
