"use client";
import {
  useRef,
  useState,
  type InputHTMLAttributes,
  type PointerEvent,
} from "react";

function moveNumberCaretToEnd(input: HTMLInputElement) {
  // Number inputs do not support setSelectionRange; resetting the value keeps
  // their native controls and places the caret after the existing digits.
  const value = input.value;
  input.value = "";
  input.value = value;
}

export function useNumberCaret() {
  const pointerFocused = useRef(false);
  return {
    onFocus: (input: HTMLInputElement) => moveNumberCaretToEnd(input),
    onPointerDown: (e: PointerEvent<HTMLInputElement>) => {
      pointerFocused.current = document.activeElement !== e.currentTarget;
    },
    onPointerUp: (e: PointerEvent<HTMLInputElement>) => {
      if (pointerFocused.current) moveNumberCaretToEnd(e.currentTarget);
      pointerFocused.current = false;
    },
  };
}

export function NumericInput({
  value,
  onValueChange,
  onFocus,
  onPointerDown,
  onPointerUp,
  ...props
}: Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "onBlur"
> & { value: number; onValueChange: (value: number) => void }) {
  const caret = useNumberCaret();
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      {...props}
      type="number"
      value={draft ?? value}
      onFocus={(e) => {
        setDraft(
          Number(e.currentTarget.value) === 0 ? "" : e.currentTarget.value,
        );
        caret.onFocus(e.currentTarget);
        onFocus?.(e);
      }}
      onPointerDown={(e) => {
        caret.onPointerDown(e);
        onPointerDown?.(e);
      }}
      onPointerUp={(e) => {
        caret.onPointerUp(e);
        onPointerUp?.(e);
      }}
      onChange={(e) => {
        setDraft(e.target.value);
        onValueChange(e.target.value === "" ? 0 : Number(e.target.value));
      }}
      onBlur={() => {
        if (draft === "") onValueChange(0);
        setDraft(null);
      }}
    />
  );
}
