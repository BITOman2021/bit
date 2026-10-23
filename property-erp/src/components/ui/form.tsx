"use client";

import { createContext, useActionState, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/app/actions/run";

const ErrorsCtx = createContext<Record<string, string[] | undefined>>({});

type Action = (state: ActionState, fd: FormData) => Promise<ActionState>;

export function ActionForm({
  action,
  children,
  submitLabel,
  pendingLabel = "…",
  className = "",
  resetOnSuccess = false,
  confirmText,
  submitClassName = "btn-primary",
  hideSubmit = false,
  encType,
}: {
  action: Action;
  children: ReactNode;
  submitLabel?: string;
  pendingLabel?: string;
  className?: string;
  resetOnSuccess?: boolean;
  confirmText?: string;
  submitClassName?: string;
  hideSubmit?: boolean;
  encType?: string;
}) {
  const [state, formAction] = useActionState(action, { ok: false });
  const ref = useRef<HTMLFormElement>(null);
  const msgRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.ok && resetOnSuccess) ref.current?.reset();
    if (state.message) msgRef.current?.focus();
  }, [state, resetOnSuccess]);
  return (
    <ErrorsCtx.Provider value={state.fieldErrors ?? {}}>
      <form
        ref={ref}
        action={formAction}
        encType={encType}
        className={className}
        noValidate={false}
        onSubmit={(e) => {
          if (confirmText && !window.confirm(confirmText)) e.preventDefault();
        }}
      >
        {children}
        {state.message && (
          <div
            ref={msgRef}
            tabIndex={-1}
            role={state.ok ? "status" : "alert"}
            className={`mt-4 rounded-lg px-4 py-3 text-sm font-medium ${state.ok ? "bg-success-bg text-success" : "bg-danger-bg text-danger"}`}
          >
            {state.message}
            {!state.ok && state.fieldErrors && Object.keys(state.fieldErrors).length > 0 && (
              <ul className="mt-1 list-disc ps-5 text-xs font-normal">
                {Object.entries(state.fieldErrors).map(([k, v]) => (
                  <li key={k}>
                    <span className="font-mono">{k}</span>: {v?.join("، ")}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {!hideSubmit && submitLabel && (
          <div className="mt-5 flex flex-wrap gap-2">
            <SubmitButton label={submitLabel} pendingLabel={pendingLabel} className={submitClassName} />
          </div>
        )}
      </form>
    </ErrorsCtx.Provider>
  );
}

export function SubmitButton({ label, pendingLabel = "…", className = "btn-primary" }: { label: string; pendingLabel?: string; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} aria-busy={pending}>
      {pending && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />}
      {pending ? pendingLabel : label}
    </button>
  );
}

function useFieldError(name: string) {
  const errors = useContext(ErrorsCtx);
  return errors[name]?.join("، ");
}

interface BaseProps {
  name: string;
  label: string;
  hint?: string;
  required?: boolean;
  className?: string;
}

function Wrap({ name, label, hint, required, className = "", children }: BaseProps & { children: ReactNode }) {
  const err = useFieldError(name.replace(/\[\]$/, ""));
  return (
    <div className={className}>
      <label htmlFor={`f-${name}`} className="label">
        {label}
        {required && <span className="ms-1 text-danger" aria-hidden>*</span>}
      </label>
      {children}
      {hint && !err && <p className="mt-1 text-xs text-muted">{hint}</p>}
      {err && (
        <p className="mt-1 text-xs font-medium text-danger" id={`e-${name}`}>
          {err}
        </p>
      )}
    </div>
  );
}

export function Input({ name, label, hint, required, className, ...rest }: BaseProps & Omit<React.InputHTMLAttributes<HTMLInputElement>, "name">) {
  const err = useFieldError(name);
  return (
    <Wrap name={name} label={label} hint={hint} required={required} className={className}>
      <input id={`f-${name}`} name={name} required={required} aria-invalid={err ? true : undefined} aria-describedby={err ? `e-${name}` : undefined} className="input" {...rest} />
    </Wrap>
  );
}

/** حقل مبلغ: لوحة أرقام على الهاتف، حتى 3 منازل عشرية */
export function MoneyInput(props: BaseProps & { defaultValue?: string; placeholder?: string; disabled?: boolean }) {
  return <Input inputMode="decimal" pattern="^-?\d+(\.\d{1,3})?$" dir="ltr" autoComplete="off" placeholder={props.placeholder ?? "0.000"} {...props} />;
}

export function Select({
  name,
  label,
  hint,
  required,
  className,
  options,
  placeholder,
  ...rest
}: BaseProps & { options: { value: string; label: string }[]; placeholder?: string } & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "name">) {
  const err = useFieldError(name);
  return (
    <Wrap name={name} label={label} hint={hint} required={required} className={className}>
      <select id={`f-${name}`} name={name} required={required} aria-invalid={err ? true : undefined} className="input" {...rest}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Wrap>
  );
}

export function Textarea({ name, label, hint, required, className, ...rest }: BaseProps & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "name">) {
  const err = useFieldError(name);
  return (
    <Wrap name={name} label={label} hint={hint} required={required} className={className}>
      <textarea id={`f-${name}`} name={name} required={required} rows={3} aria-invalid={err ? true : undefined} className="input" {...rest} />
    </Wrap>
  );
}

export function Checkbox({ name, label, defaultChecked, hint, value }: { name: string; label: string; defaultChecked?: boolean; hint?: string; value?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-white p-3 hover:bg-navy-50">
      <input type="checkbox" name={name} value={value ?? "on"} defaultChecked={defaultChecked} className="mt-0.5 h-5 w-5 accent-navy-900" />
      <span>
        <span className="block text-sm font-semibold">{label}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
    </label>
  );
}

/** زر إجراء صغير (تفعيل/إلغاء/اعتماد) مع تأكيد وسبب اختياري */
export function ActionButton({
  action,
  fields = {},
  label,
  className = "btn-secondary btn-sm",
  confirmText,
  askReason,
}: {
  action: Action;
  fields?: Record<string, string>;
  label: string;
  className?: string;
  confirmText?: string;
  askReason?: string;
}) {
  const [state, formAction] = useActionState(action, { ok: false });
  const [reason, setReason] = useState("");
  return (
    <form
      action={formAction}
      className="inline-flex flex-col items-start gap-1"
      onSubmit={(e) => {
        if (askReason) {
          const r = window.prompt(askReason);
          if (!r) {
            e.preventDefault();
            return;
          }
          setReason(r);
          const input = e.currentTarget.querySelector<HTMLInputElement>("input[name=reason]");
          if (input) input.value = r;
        } else if (confirmText && !window.confirm(confirmText)) e.preventDefault();
      }}
    >
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {askReason && <input type="hidden" name="reason" defaultValue={reason} />}
      <SubmitButton label={label} className={className} />
      {state.message && (
        <span role={state.ok ? "status" : "alert"} className={`max-w-xs text-xs ${state.ok ? "text-success" : "text-danger"}`}>
          {state.message}
        </span>
      )}
    </form>
  );
}
