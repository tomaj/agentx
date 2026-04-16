"use client";

import { cn } from "@/lib/utils";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { TextareaHTMLAttributes } from "react";

interface AutoresizeTextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  minRows?: number;
}

export const AutoresizeTextarea = forwardRef<HTMLTextAreaElement, AutoresizeTextareaProps>(
  function AutoresizeTextarea({ minRows = 3, className, ...props }, forwardedRef) {
    const innerRef = useRef<HTMLTextAreaElement>(null);

    useImperativeHandle(forwardedRef, () => innerRef.current!);

    function resize() {
      const el = innerRef.current;
      if (!el) return;
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }

    useEffect(() => {
      resize();
    });

    return (
      <textarea
        ref={innerRef}
        rows={minRows}
        onInput={resize}
        className={cn("resize-none overflow-hidden", className)}
        {...props}
      />
    );
  },
);
