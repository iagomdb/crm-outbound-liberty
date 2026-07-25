"use client";

/** Marca/desmarca todos os checkboxes name="sel" do mesmo form (seleção em massa). */
export function SelectAllCheckbox() {
  return (
    <input
      type="checkbox"
      title="selecionar tudo (desta página)"
      className="size-4 accent-zinc-900 dark:accent-white"
      onChange={(e) => {
        e.currentTarget.form
          ?.querySelectorAll<HTMLInputElement>('input[name="sel"]')
          .forEach((cb) => {
            cb.checked = e.currentTarget.checked;
          });
      }}
    />
  );
}
