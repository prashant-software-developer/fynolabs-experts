import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ChevronDown, Download, FileText, Printer } from "@/components/icons";
import { getDb } from "@/db/client";
import { portalContext } from "@/lib/auth/expert";
import { todayIST } from "@/lib/crm/dates";
import { one, type SearchParams } from "@/lib/filters";
import { bytes } from "@/lib/format";
import { DOCUMENT_KIND_LABELS } from "@/lib/talent";
import { MAX_UPLOAD_LABEL } from "@/lib/upload-limit";
import {
  autoValues,
  bodyBlocks,
  documentForExpert,
  dueText,
  istDateTime,
  istDay,
  markViewed,
  SIGN_CONSENT,
  signerProfile,
  signFields,
  type DocFile,
} from "@/lib/server/portal-documents";
import { PortalCard, PortalEmpty, PortalHeader } from "@/components/portal/page";
import { DocumentBody } from "@/components/portal/documents/document-body";
import { SignForm } from "@/components/portal/documents/sign-form";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { FlashFromParams, Notice } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/field";
import { FileDrop } from "@/components/ui/file-drop";
import { uploadSignedCopyAction } from "../actions";

export const metadata = { title: "Document" };

const kindLabel = (k: string) => DOCUMENT_KIND_LABELS[k as keyof typeof DOCUMENT_KIND_LABELS] ?? "Document";

function Back() {
  return (
    <Link href="/me/documents" className="mb-6 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground">
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Documents
    </Link>
  );
}

/** A PDF in the page (phones that can't show it inline still get the download). */
function PdfView({ src, file }: { src: string; file: DocFile }) {
  return (
    <PortalCard className="overflow-hidden">
      <iframe src={src} title={file.filename} className="block h-[75vh] min-h-[420px] w-full border-0 bg-secondary/40" />
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3">
        <span className="min-w-0 truncate text-[13px] text-muted-foreground">
          {file.filename}
          {file.size ? ` · ${bytes(file.size)}` : ""}
        </span>
        <a href={`${src}${src.includes("?") ? "&" : "?"}download=1`} className={buttonClass("secondary", "sm")}>
          <Download className="h-3.5 w-3.5" aria-hidden /> Download
        </a>
      </div>
    </PortalCard>
  );
}

/** A file the browser can't show (e.g. a Word document): download only. */
function FileCard({ src, file }: { src: string; file: DocFile }) {
  return (
    <PortalCard className="flex flex-wrap items-center gap-4 px-5 py-5 sm:px-8">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-secondary text-foreground/70" aria-hidden>
        <FileText className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] text-foreground">{file.filename}</p>
        <p className="text-[13px] text-muted-foreground">{file.size ? `${bytes(file.size)} · ` : ""}Download it and read it before you sign.</p>
      </div>
      <a href={`${src}${src.includes("?") ? "&" : "?"}download=1`} className={buttonClass("secondary", "sm")}>
        <Download className="h-3.5 w-3.5" aria-hidden /> Download
      </a>
    </PortalCard>
  );
}

export default async function DocumentPage({ params, searchParams }: { params: Promise<{ ref: string }>; searchParams: Promise<SearchParams> }) {
  const { ref } = await params;
  const sp = await searchParams;
  const ctx = await portalContext(`/me/documents/${encodeURIComponent(ref)}`);
  if (ctx.kind !== "expert") return null;
  const db = await getDb();
  const doc = await documentForExpert(db, ctx.expertId, ref);
  if (doc && "redirect" in doc) redirect(`/me/documents/${doc.redirect}`);
  if (!doc)
    return (
      <>
        <Back />
        <PortalEmpty
          title="We can't find this document"
          description="It may have been withdrawn, or it belongs to another account. Your Documents page lists everything you still need to sign."
          action={
            <Link href="/me/documents" className={buttonClass("secondary", "sm")}>
              Go to Documents
            </Link>
          }
        />
      </>
    );
  await markViewed(db, ctx.expertId, doc);
  const profile = await signerProfile(db, ctx.expertId);
  const signed = doc.status === "signed";
  const fileSrc = `/api/me/documents/${doc.ref}`;
  const line = signed ? (doc.signedAt ? `Signed ${istDay(doc.signedAt)}` : "Signed") : dueText(doc.dueOn, todayIST());
  const defaultName = profile?.fullName ?? "";

  const signForm =
    !signed && profile && doc.format !== "missing" ? (
      <SignForm
        docRef={doc.ref}
        blocks={doc.format === "text" ? bodyBlocks(doc.body) : null}
        fields={doc.format === "text" ? signFields(doc.body, profile) : []}
        auto={autoValues(profile)}
        defaultName={defaultName}
        consentText={SIGN_CONSENT}
      />
    ) : null;

  return (
    <>
      <Back />
      <PortalHeader
        title={
          <>
            {doc.title}
            {signed ? <Badge tone="success">Done</Badge> : null}
          </>
        }
        subtitle={`${kindLabel(doc.kind)} · ${line}${doc.description ? `. ${doc.description}` : ""}`}
        action={
          signed ? (
            <a href={`/me/documents/${doc.ref}/print`} target="_blank" rel="noopener" className={buttonClass("secondary", "sm")}>
              <Printer className="h-3.5 w-3.5" aria-hidden /> Download / print
            </a>
          ) : undefined
        }
      />
      <FlashFromParams ok={one(sp.ok)} error={one(sp.error)} />
      <div className="space-y-6">
        {signed ? (
          <Notice tone="success" title={`${one(sp.signed) === "1" ? "Thank you. " : ""}Signed by ${doc.signedName ?? "you"}${doc.signedAt ? ` on ${istDay(doc.signedAt)}` : ""}`}>
            {doc.signMethod === "upload" ? "You uploaded a signed copy" : doc.signMethod === "typed" ? "Signed electronically by typing your name" : "Recorded by the FynoLabs team"}
            {doc.signedAt ? ` (${istDateTime(doc.signedAt)})` : ""}. Keep a copy: use Download / print.
          </Notice>
        ) : null}

        {doc.format === "missing" ? (
          <Notice tone="warning" title="This document isn't ready yet">
            We&apos;re still preparing it. If you were asked to sign it, write to hello@fynolabs.si.
          </Notice>
        ) : null}

        {doc.format === "text" && signed && doc.body ? (
          <PortalCard as="article" className="px-5 py-6 sm:px-10 sm:py-10">
            <DocumentBody blocks={bodyBlocks(doc.body)} />
          </PortalCard>
        ) : null}

        {doc.format === "pdf" || doc.format === "file" ? (
          <>
            {signed && doc.signedCopy ? (
              <>
                {doc.signedCopy.pdf ? <PdfView src={`${fileSrc}?file=signed`} file={doc.signedCopy} /> : <FileCard src={`${fileSrc}?file=signed`} file={doc.signedCopy} />}
                {doc.original ? (
                  <p className="text-[13px] text-muted-foreground">
                    The document as we sent it:{" "}
                    <a href={`${fileSrc}?download=1`} className="text-primary underline-offset-4 hover:underline">
                      {doc.original.filename}
                    </a>
                  </p>
                ) : null}
              </>
            ) : doc.original ? (
              doc.original.pdf ? (
                <PdfView src={fileSrc} file={doc.original} />
              ) : (
                <FileCard src={fileSrc} file={doc.original} />
              )
            ) : null}
          </>
        ) : null}

        {signForm}

        {!signed && (doc.format === "pdf" || doc.format === "file") ? (
          <details className="group rounded-xl border border-border bg-card">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-[15px] text-foreground sm:px-8 [&::-webkit-details-marker]:hidden">
              Upload a signed copy instead
              <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <form action={uploadSignedCopyAction} className="space-y-4 border-t border-border px-5 py-5 sm:px-8">
              <input type="hidden" name="ref" value={doc.ref} />
              <p className="text-sm text-muted-foreground">Prefer pen and paper? Download the document, sign it, scan it and upload it here as a PDF.</p>
              <Field label="Full legal name" htmlFor="uploadName">
                <Input id="uploadName" name="signedName" defaultValue={defaultName} required minLength={3} maxLength={200} autoComplete="name" />
              </Field>
              <FileDrop name="file" accept="application/pdf,.pdf" label="Choose the signed PDF" hint={`PDF, up to ${MAX_UPLOAD_LABEL}.`} submitLabel="Upload signed copy" />
            </form>
          </details>
        ) : null}
      </div>
    </>
  );
}
