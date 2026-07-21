"use client";

import { useFormStatus } from "react-dom";
import { buttonClasses, type ButtonSize, type ButtonVariant } from "@/components/ui";

// Feedback de envio pra forms cujas actions demoram (ex.: importação de
// planilha): enquanto a action roda, os botões desabilitam (evita duplo clique)
// e o PendingNote aparece. Precisam estar DENTRO do <form> (useFormStatus).

type PendingButtonProps = React.ComponentProps<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** texto exibido enquanto a action roda (default: mantém o children) */
  pendingText?: string;
};

export function PendingButton({ variant, size, className, pendingText, children, disabled, ...props }: PendingButtonProps) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending || disabled} className={buttonClasses(variant, size, className)} {...props}>
      {pending && pendingText ? pendingText : children}
    </button>
  );
}

/** Aviso que só aparece enquanto o form está enviando. */
export function PendingNote({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  if (!pending) return null;
  return <p className="animate-pulse text-sm text-zinc-500">{children}</p>;
}
