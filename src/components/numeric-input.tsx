"use client";
import { useState, type InputHTMLAttributes } from "react";

export function NumericInput({
  value,
  onValueChange,
  ...props
}: Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "onBlur"
> & { value: number; onValueChange: (value: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      {...props}
      type="number"
      value={draft ?? value}
      onFocus={(e) => setDraft(e.currentTarget.value)}
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
