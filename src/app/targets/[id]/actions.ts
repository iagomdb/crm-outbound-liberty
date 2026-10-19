"use server";

import { revalidatePath } from "next/cache";
import { assertTarget } from "@/auth/access";
import { getDb } from "@/db";
import { recordCall } from "@/core/log-call";
import { parseCallForm } from "@/lib/call-form";

export async function logCall(targetId: string, formData: FormData) {
  const { access } = await assertTarget(targetId);
  await recordCall(getDb(), targetId, parseCallForm(formData), access.id);

  revalidatePath(`/targets/${targetId}`);
  revalidatePath("/", "layout");
}
