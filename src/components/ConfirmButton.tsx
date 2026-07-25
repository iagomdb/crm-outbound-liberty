"use client";

/** Botão de submit que pede confirmação antes — pra escapes que fogem do ciclo. */
export function ConfirmButton({
  message,
  className,
  formAction,
  children,
}: {
  message: string;
  className?: string;
  /** action alternativa dentro de um form compartilhado (seleção em massa) */
  formAction?: (formData: FormData) => void | Promise<void>;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      className={className}
      formAction={formAction}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
