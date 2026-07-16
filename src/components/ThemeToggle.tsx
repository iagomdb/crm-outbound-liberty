"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { THEME_STORAGE_KEY } from "@/lib/theme";

type Choice = "system" | "light" | "dark";

const ICON: Record<Choice, string> = { system: "◐", light: "☀", dark: "☾" };
const LABEL: Record<Choice, string> = { system: "tema: sistema", light: "tema: claro", dark: "tema: escuro" };
const NEXT: Record<Choice, Choice> = { system: "light", light: "dark", dark: "system" };

function systemTheme(): "dark" | "light" {
  return typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Aplica o tema efetivo no <html> — a mesma lógica do ThemeScript. */
function applyEffective(choice: Choice) {
  const eff = choice === "system" ? systemTheme() : choice;
  document.documentElement.setAttribute("data-theme", eff);
}

export function ThemeToggle() {
  // começa em "system" no servidor; o valor real é lido no efeito (evita mismatch)
  const [choice, setChoice] = useState<Choice>("system");

  useEffect(() => {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    setChoice(saved === "dark" || saved === "light" ? saved : "system");
  }, []);

  // no modo "sistema", segue mudanças do SO em tempo real
  useEffect(() => {
    if (choice !== "system") return;
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyEffective("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [choice]);

  function cycle() {
    const next = NEXT[choice];
    setChoice(next);
    if (next === "system") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, next);
    applyEffective(next);
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={cycle}
      title={LABEL[choice]}
      aria-label={LABEL[choice]}
      className="text-base leading-none"
    >
      <span suppressHydrationWarning>{ICON[choice]}</span>
    </Button>
  );
}
