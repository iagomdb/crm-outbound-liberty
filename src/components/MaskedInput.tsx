"use client";

type Mask = "cnpj" | "phone" | "cep" | "uf";

/** Aplica a máscara progressivamente conforme o usuário digita (valor parcial ok). */
function applyMask(mask: Mask, raw: string): string {
  if (mask === "uf") return raw.replace(/[^a-zA-Z]/g, "").toUpperCase().slice(0, 2);

  const d = raw.replace(/\D/g, "");
  if (mask === "cnpj") {
    const s = d.slice(0, 14);
    let out = s.slice(0, 2);
    if (s.length > 2) out += "." + s.slice(2, 5);
    if (s.length > 5) out += "." + s.slice(5, 8);
    if (s.length > 8) out += "/" + s.slice(8, 12);
    if (s.length > 12) out += "-" + s.slice(12);
    return out;
  }
  if (mask === "cep") {
    const s = d.slice(0, 8);
    return s.length > 5 ? `${s.slice(0, 5)}-${s.slice(5)}` : s;
  }
  // phone: (00) 0000-0000 ou (00) 00000-0000
  const s = d.slice(0, 11);
  if (!s) return "";
  let out = `(${s.slice(0, 2)}`;
  if (s.length > 2) out += `) ${s.length > 10 ? s.slice(2, 7) : s.slice(2, 6)}`;
  if (s.length > 6) out += `-${s.length > 10 ? s.slice(7) : s.slice(6)}`;
  return out;
}

const PLACEHOLDER: Record<Mask, string> = {
  cnpj: "00.000.000/0000-00",
  phone: "(00) 00000-0000",
  cep: "00000-000",
  uf: "UF",
};

/** Input com máscara brasileira. O servidor recebe o valor mascarado e deve normalizar (strip de não-dígitos). */
export function MaskedInput({
  mask,
  defaultValue,
  placeholder,
  ...props
}: { mask: Mask } & Omit<React.ComponentProps<"input">, "onChange">) {
  return (
    <input
      {...props}
      inputMode={mask === "uf" ? undefined : "numeric"}
      placeholder={placeholder ?? PLACEHOLDER[mask]}
      defaultValue={typeof defaultValue === "string" ? applyMask(mask, defaultValue) : defaultValue}
      onChange={(e) => {
        e.currentTarget.value = applyMask(mask, e.currentTarget.value);
      }}
    />
  );
}
