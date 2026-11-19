import { useState } from "react";
import { Check, Copy } from "lucide-react";
import Button from "./Button";

export default function CopyButton({
  text,
  label = "Copy",
  iconOnly = false,
}: {
  text: string;
  label?: string;
  iconOnly?: boolean;
}) {
  const [feedback, setFeedback] = useState<"idle" | "copied" | "error">("idle");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setFeedback("copied");
    } catch {
      setFeedback("error");
    }
    window.setTimeout(() => setFeedback("idle"), 1400);
  };
  const description = feedback === "copied" ? "Copied" : feedback === "error" ? "Copy failed" : label;
  return (
    <Button type="button" variant="secondary" className="copy-action" aria-label={description} title={description} onClick={copy}>
      {feedback === "copied" ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
      <span className={iconOnly ? "sr-only" : undefined} aria-live="polite">{description}</span>
    </Button>
  );
}
