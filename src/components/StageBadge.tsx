import { STAGE_CLASSES, STAGE_LABELS, type Stage } from "@/core/pipeline";

export function StageBadge({ stage }: { stage: Stage }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STAGE_CLASSES[stage]}`}>
      {STAGE_LABELS[stage]}
    </span>
  );
}
