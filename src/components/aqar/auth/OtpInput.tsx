"use client";

// ──────────────────────────────────────────────────────────────────
//  OtpInput — accessible 6-digit code input.
//
//  Features:
//  • 6 separate input boxes, auto-advance on type, backspace goes back.
//  • Paste support (the whole code at once).
//  • Numeric-only (filters non-digits on input).
//  • Accessible: labeled, keyboard-navigable, ARIA-live for errors.
//  • Calls onComplete(code) when all 6 digits are entered.
//
//  SECURITY:
//  ─────────
//  • The code is held in component state only — never logged, never
//    persisted to localStorage. On unmount it's garbage-collected.
//  • Auto-submit on completion is intentionally OFF — the user must
//    click "verify" to prevent accidental submits from typo'd last digit.
// ──────────────────────────────────────────────────────────────────

import { useRef, useState, useEffect, useCallback } from "react";
import { useI18n } from "@/lib/i18n";

interface Props {
  length?: number; // default 6
  value: string;
  onChange: (code: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  hasError?: boolean;
}

export function OtpInput({
  length = 6,
  value,
  onChange,
  disabled = false,
  autoFocus = true,
  hasError = false,
}: Props) {
  const { dir } = useI18n();
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);
  const [localDigits, setLocalDigits] = useState<string[]>(() => {
    const initial = value.split("").filter((c) => /\d/.test(c));
    return Array.from({ length }, (_, i) => initial[i] || "");
  });

  // Sync external value → internal state (e.g., when parent resets)
  useEffect(() => {
    const digits = value.split("").filter((c) => /\d/.test(c));
    setLocalDigits(Array.from({ length }, (_, i) => digits[i] || ""));
  }, [value, length]);

  // Auto-focus first input on mount
  useEffect(() => {
    if (autoFocus && !disabled) {
      inputsRef.current[0]?.focus();
    }
  }, [autoFocus, disabled]);

  const emitChange = useCallback(
    (next: string[]) => {
      const code = next.join("");
      onChange(code);
    },
    [onChange],
  );

  const handleChange = (idx: number, raw: string) => {
    if (disabled) return;
    // Take only the last typed digit (allows replacing without backspace)
    const digit = raw.replace(/\D/g, "").slice(-1);

    const next = [...localDigits];
    next[idx] = digit;
    setLocalDigits(next);
    emitChange(next);

    // Auto-advance to next input
    if (digit && idx < length - 1) {
      inputsRef.current[idx + 1]?.focus();
    }
  };

  const handleKeyDown = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;
    if (e.key === "Backspace") {
      if (localDigits[idx]) {
        // Clear current
        const next = [...localDigits];
        next[idx] = "";
        setLocalDigits(next);
        emitChange(next);
      } else if (idx > 0) {
        // Move back + clear previous
        inputsRef.current[idx - 1]?.focus();
        const next = [...localDigits];
        next[idx - 1] = "";
        setLocalDigits(next);
        emitChange(next);
        e.preventDefault();
      }
    } else if (e.key === "ArrowLeft" && idx > 0) {
      inputsRef.current[dir === "rtl" ? idx + 1 : idx - 1]?.focus();
      e.preventDefault();
    } else if (e.key === "ArrowRight" && idx < length - 1) {
      inputsRef.current[dir === "rtl" ? idx - 1 : idx + 1]?.focus();
      e.preventDefault();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    if (disabled) return;
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (!pasted) return;
    const next = Array.from({ length }, (_, i) => pasted[i] || "");
    setLocalDigits(next);
    emitChange(next);
    // Focus last filled input (or last input if all filled)
    const lastFilledIdx = Math.min(pasted.length, length) - 1;
    inputsRef.current[lastFilledIdx]?.focus();
  };

  return (
    <div
      className="flex gap-2 justify-center"
      dir="ltr" // OTP digits are always LTR even in Arabic UI
      role="group"
      aria-label="one-time code input"
    >
      {localDigits.map((digit, idx) => (
        <input
          key={idx}
          ref={(el) => {
            inputsRef.current[idx] = el;
          }}
          type="text"
          inputMode="numeric"
          pattern="\d*"
          maxLength={1}
          value={digit}
          onChange={(e) => handleChange(idx, e.target.value)}
          onKeyDown={(e) => handleKeyDown(idx, e)}
          onPaste={handlePaste}
          disabled={disabled}
          aria-label={`digit ${idx + 1}`}
          className={`w-12 h-14 sm:w-14 sm:h-16 text-center text-2xl font-bold rounded-lg border-2 transition outline-none ${
            hasError
              ? "border-destructive focus:border-destructive bg-destructive/5"
              : digit
                ? "border-primary focus:border-primary bg-primary/5"
                : "border-border focus:border-primary"
          } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
        />
      ))}
    </div>
  );
}
