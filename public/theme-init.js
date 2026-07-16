// Roda antes da primeira pintura (script no <head> com src de mesma origem —
// compatível com CSP script-src 'self', diferente de um <script> inline).
// Resolve a preferência salva (ou o sistema) e escreve data-theme no <html>,
// que é a fonte de verdade do CSS. Mantido em sincronia com ThemeToggle.tsx
// e a STORAGE_KEY "theme".
(function () {
  try {
    var pref = localStorage.getItem("theme");
    var sys = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    var eff = pref === "dark" || pref === "light" ? pref : sys;
    document.documentElement.setAttribute("data-theme", eff);
  } catch (e) {}
})();
