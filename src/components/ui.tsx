"use client";
import {
  Component,
  useEffect,
  useRef,
  useId,
  type ReactNode,
  type InputHTMLAttributes,
} from "react";
import { X, AlertCircle } from "lucide-react";
export function Modal({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = old;
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "modal-wide" : ""}`}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      aria-label={title}
    >
      <div className="modal-heading">
        <div>
          <h2>{title}</h2>
          {subtitle && <p className="muted">{subtitle}</p>}
        </div>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export class CardBoundary extends Component<
  { children: ReactNode; resetKey?: string },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  componentDidUpdate(previous: { resetKey?: string }) {
    if (this.state.error && previous.resetKey !== this.props.resetKey) {
      this.setState({ error: false });
    }
  }
  render() {
    return this.state.error ? (
      <div className="empty-state">
        <AlertCircle />
        <h3>This component couldn’t load.</h3>
        <p>Check its settings or reload the page.</p>
      </div>
    ) : (
      this.props.children
    );
  }
}
export function localInput(iso = new Date().toISOString()) {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
export function formatDate(
  iso: string,
  options: Intl.DateTimeFormatOptions = {},
) {
  return new Date(iso).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(iso.length === 10 ? { timeZone: "UTC" } : {}),
    ...options,
  });
}
export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
export function DateInput({
  value,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value"> & {
  type: "date" | "datetime-local";
  value: string;
}) {
  const hintId = useId();
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  const weekday = Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString("en-GB", { weekday: "short" });
  return (
    <span className="date-input">
      <input
        {...props}
        value={value}
        aria-describedby={
          [props["aria-describedby"], weekday ? hintId : undefined]
            .filter(Boolean)
            .join(" ") || undefined
        }
      />
      {weekday && (
        <span id={hintId} className="date-weekday" aria-hidden="true">
          {weekday}
        </span>
      )}
    </span>
  );
}
export function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}
export function number(value: number) {
  return new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 }).format(
    value,
  );
}
