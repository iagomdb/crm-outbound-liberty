import type { CallInput } from "@/core/log-call";
import type { ObjectiveHit, Stage } from "@/core/pipeline";

const str = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim() : "");
const on = (v: FormDataEntryValue | null) => v === "on" || v === "true";
const tri = (fd: FormData, key: string): boolean | null => (fd.get(key) == null ? null : on(fd.get(key)));

/** FormData do CallLogForm → CallInput (compartilhado pelas actions de registro). */
export function parseCallForm(formData: FormData): CallInput {
  const nextRaw = str(formData.get("nextActionAt"));
  const mental = str(formData.get("mentalState"));
  const stage = str(formData.get("stage"));

  return {
    reachedHuman: on(formData.get("reachedHuman")),
    type: (str(formData.get("type")) || "ligacao") as CallInput["type"],
    outcome: str(formData.get("outcome")) || null,
    stalledAt: str(formData.get("stalledAt")) || null,
    objection: (str(formData.get("objection")) || "nenhuma") as CallInput["objection"],
    objectionIsReflexo: tri(formData, "objectionIsReflexo"),
    hypothesisLanded: tri(formData, "hypothesisLanded"),
    objectiveHit: (str(formData.get("objectiveHit")) || "nenhum") as ObjectiveHit,
    qualified: on(formData.get("qualified")),
    contactId: str(formData.get("contactId")) || null,
    mentalState: (mental || null) as CallInput["mentalState"],
    stageOverride: (stage || null) as Stage | null,
    nextActionAt: nextRaw ? new Date(nextRaw) : null,
    nextActionPretext: str(formData.get("nextActionPretext")) || null,
    lostReason: str(formData.get("lostReason")) || null,
    notes: str(formData.get("notes")) || null,
    dorPercebida: str(formData.get("dorPercebida")) === "" ? null : Number(str(formData.get("dorPercebida"))),
    icpGrade: (str(formData.get("icpGrade")) || null) as CallInput["icpGrade"],
    tipoCobranca: (str(formData.get("tipoCobranca")) || null) as CallInput["tipoCobranca"],
    faixaClientes: (str(formData.get("faixaClientes")) || null) as CallInput["faixaClientes"],
    portePercebido: (str(formData.get("portePercebido")) || null) as CallInput["portePercebido"],
    now: new Date(),
  };
}
