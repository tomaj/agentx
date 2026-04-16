"use client";

import { cn } from "@/lib/utils";
import { useState } from "react";

interface CopyButtonProps {
  text: string;
  label?: string;
  className?: string;
}

export function CopyButton({ text, label, className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button
      onClick={handleCopy}
      className={cn(
        "text-xs text-muted-foreground hover:text-foreground transition-colors",
        className,
      )}
      title="Copy to clipboard"
      aria-label={`Copy ${label ?? "value"} to clipboard`}
    >
      {copied ? "Copied" : (label ?? "Copy")}
    </button>
  );
}
