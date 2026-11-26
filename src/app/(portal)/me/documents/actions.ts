"use server";
// Signing documents in the expert portal. The expert id always comes from the signed-in session
// (ownExpertId), never from the form, so nobody can sign or see someone else's document.
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { ownExpertId } from "@/lib/auth/expert";
import { clientIp, parseRef, signDocument, uploadSignedCopy } from "@/lib/server/portal-documents";

export type SignState = { message?: string; errors?: Record<string, string> };

const withMsg = (path: string, kind: "ok" | "error", text: string) => `${path}${path.includes("?") ? "&" : "?"}${kind}=${encodeURIComponent(text)}`;

async function me(next: string): Promise<string> {
  const id = await ownExpertId();
  if (!id) redirect(`/signin?callbackUrl=${encodeURIComponent(next)}`);
  return id;
}

/** Where the request came from: the first x-forwarded-for address, else x-real-ip. */
async function requestMeta(): Promise<{ ip: string | null; userAgent: string | null }> {
  const h = await headers();
  return { ip: clientIp(h), userAgent: h.get("user-agent") };
}

const refFrom = (fd: FormData) => {
  const r = parseRef(String(fd.get("ref") ?? ""));
  return r ? `${r.kind}-${r.id}` : null;
};

export async function signDocumentAction(_prev: SignState, fd: FormData): Promise<SignState> {
  const ref = refFrom(fd);
  if (!ref) return { message: "We couldn't find this document. Open it again from your Documents page." };
  const id = await me(`/me/documents/${ref}`);
  const fields: Record<string, string> = {};
  const ticked: number[] = [];
  for (const [k, v] of fd.entries()) {
    if (typeof v !== "string") continue;
    if (k.startsWith("f_")) fields[k.slice(2)] = v;
    const box = /^check_(\d{1,3})$/.exec(k);
    if (box && v) ticked.push(Number(box[1]));
  }
  const res = await signDocument(await getDb(), id, ref, { name: String(fd.get("signedName") ?? ""), fields, ticked, consent: fd.get("consent") === "yes", ...(await requestMeta()) });
  if (!res.ok) return { message: res.message, errors: res.errors };
  revalidatePath("/me", "layout");
  redirect(`/me/documents/${res.ref}?signed=1`);
}

export async function uploadSignedCopyAction(fd: FormData) {
  const ref = refFrom(fd);
  if (!ref) redirect("/me/documents");
  const id = await me(`/me/documents/${ref}`);
  const file = fd.get("file");
  const upload = file instanceof File && file.size > 0 ? { filename: file.name, mime: file.type, bytes: new Uint8Array(await file.arrayBuffer()) } : null;
  const res = await uploadSignedCopy(await getDb(), id, ref, { name: String(fd.get("signedName") ?? ""), file: upload, ...(await requestMeta()) });
  if (!res.ok) redirect(withMsg(`/me/documents/${ref}`, "error", res.reason));
  revalidatePath("/me", "layout");
  redirect(`/me/documents/${res.ref}?signed=1`);
}
