/** Chave do localStorage do tema — compartilhada entre o script anti-flash
 *  (/public/theme-init.js), o ThemeScript (server) e o ThemeToggle (client).
 *  Módulo sem dependências pra poder ser importado dos dois lados. */
export const THEME_STORAGE_KEY = "theme";
