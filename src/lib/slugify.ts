/** nome → slug de URL: "Carteira Nova SP" → "carteira-nova-sp". */
export const slugify = (v: string) =>
  v
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
