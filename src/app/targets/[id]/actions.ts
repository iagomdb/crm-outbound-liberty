"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/auth/dal";
import { getDb } from "@/db";
import { recordCall } from "@/core/log-call";
import { parseCallForm } from "@/lib/call-form";

export async function logCall(targetId: string, formData: FormData) {
  await requireUser();
  await recordCall(getDb(), targetId, parseCallForm(formData));

  revalidatePath(`/targets/${targetId}`);
  revalidatePath("/", "layout");
}
