// Script inline que roda durante o parse do HTML, ANTES da primeira pintura —
// evita o "flash" de tema errado. Resolve a preferência salva (ou o sistema) e
// escreve data-theme="dark"|"light" no <html>, que é a fonte de verdade do CSS.
// Mantido em sincronia com ThemeToggle (mesma STORAGE_KEY e mesma lógica).

export const THEME_STORAGE_KEY = "theme";

const SCRIPT = `(function(){try{
  var pref = localStorage.getItem("${THEME_STORAGE_KEY}");
  var sys = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  var eff = (pref === "dark" || pref === "light") ? pref : sys;
  document.documentElement.setAttribute("data-theme", eff);
}catch(e){}})()`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
}
