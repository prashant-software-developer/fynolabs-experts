import Link from "next/link";
import { Plus } from "lucide-react";
import { getDb } from "@/db/client";
import { can, canSeeContact, maskEmail } from "@/lib/auth/permissions";
import { requireSection } from "@/lib/auth/section-guard";
import { DOCUMENT_KINDS } from "@/lib/constants";
import { todayIST } from "@/lib/crm/dates";
import { hrefWith, one, type SearchParams } from "@/lib/filters";
import { bytes, fmtDate } from "@/lib/format";
import { DOCUMENT_KIND_LABELS, DOCUMENT_STATUS_LABELS, DOCUMENT_STATUS_TONE } from "@/lib/talent";
import {
  bodyBlocks,
  documentStats,
  getTemplate,
  istDay,
  listSentDocuments,
  listTemplates,
  PORTAL_DOCUMENTS_URL,
  TEMPLATE_TEXT_HELP,
  templateChoices,
} from "@/lib/server/portal-documents";
import { DocumentBody } from "@/components/portal/documents/document-body";
import { MapBadge, SectionBlocked } from "@/components/talent/bits";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/client";
import { CopyButton } from "@/components/ui/copy-button";
import { EmptyState, FlashFromParams, Notice } from "@/components/ui/feedback";
import { Field, FieldRow, Input, Select, Textarea } from "@/components/ui/field";
import { FilePicker } from "@/components/ui/file-picker";
import { PageHeader, Section, Stack, Stat, StatGrid } from "@/components/ui/layout";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { deleteTemplateForm, sendDocumentForm } from "./actions";
import { TemplateForm } from "./template-form";

export const metadata = { title: "Documents" };

const TABS = ["templates", "send", "sent"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABELS: Record<Tab, string> = { templates: "Templates", send: "Send to an expert", sent: "Sent & signed" };
const KIND_OPTIONS = DOCUMENT_KINDS.map((k) => ({ value: k, label: DOCUMENT_KIND_LABELS[k] }));
const kindLabel = (k: string) => DOCUMENT_KIND_LABELS[k as keyof typeof DOCUMENT_KIND_LABELS] ?? k;
const METHOD_SHORT: Record<string, string> = { typed: "Typed name", upload: "Signed copy" };
const yesNo = (v: boolean) => (v ? <Badge tone="success">Yes</Badge> : <Badge tone="muted">No</Badge>);

export default async function AdminDocumentsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const { user, allowed } = await requireSection("profiles");
  if (!allowed) return <SectionBlocked title="Documents" section="profiles" />;
  const db = await getDb();
  const canEdit = can(user.role, "experts.edit");
  const contact = canSeeContact(user.role);
  const tabRaw = one(sp.tab);
  const tab: Tab = (TABS as readonly string[]).includes(tabRaw) ? (tabRaw as Tab) : "templates";
  const editId = canEdit && tab === "templates" ? one(sp.edit) : "";
  const [templates, stats, sent, choices, editing] = await Promise.all([
    listTemplates(db),
    documentStats(db),
    tab === "sent" ? listSentDocuments(db, 200) : Promise.resolve([]),
    tab === "send" ? templateChoices(db) : Promise.resolve([]),
    editId && editId !== "new" ? getTemplate(db, editId) : Promise.resolve(null),
  ]);
  const base = "/admin/documents";
  const tabHref = (t: Tab) => (t === "templates" ? base : `${base}?tab=${t}`);
  const listHref = `${base}?tab=templates`;
  const showForm = editId === "new" || Boolean(editing);
  const today = todayIST();

  return (
    <>
      <PageHeader
        title="Documents"
        subtitle="NDAs, agreements and consents experts read and sign in their portal."
        actions={
          canEdit ? (
            <>
              <ButtonLink href={`${base}?tab=send`} size="sm">
                Send to an expert
              </ButtonLink>
              <ButtonLink href={`${base}?tab=templates&edit=new`} variant="primary" size="sm">
                <Plus className="h-4 w-4" aria-hidden /> New template
              </ButtonLink>
            </>
          ) : null
        }
      />
      <FlashFromParams ok={one(sp.ok)} error={one(sp.error)} />
      <div className="mb-6">
        <StatGrid>
          <Stat label="Active templates" value={templates.filter((t) => t.active).length} hint={`${templates.filter((t) => t.active && t.requiredForAll).length} for every expert`} href={tabHref("templates")} />
          <Stat label="Waiting for a signature" value={stats.waiting} hint="Sent to one expert" href={tabHref("sent")} />
          <Stat label="Signed" value={stats.signed} href={tabHref("sent")} />
          <Stat label="Signed this week" value={stats.week} hint="Last 7 days" href={tabHref("sent")} />
        </StatGrid>
      </div>
      <Tabs tabs={TABS.map((t) => ({ href: tabHref(t), label: TAB_LABELS[t], active: tab === t, count: t === "templates" ? templates.length : undefined }))} />

      {tab === "templates" ? (
        <Stack>
          {editId && editId !== "new" && !editing ? <Notice tone="warning">That template no longer exists.</Notice> : null}
          {showForm ? (
            <Section title={editing ? `Edit: ${editing.title}` : "New template"} description="Text that fills in each expert's details when they sign, or a PDF they sign as it is.">
              <TemplateForm
                key={editing?.id ?? "new"}
                kinds={KIND_OPTIONS}
                textHelp={TEMPLATE_TEXT_HELP}
                cancelHref={listHref}
                initial={{
                  id: editing?.id ?? null,
                  title: editing?.title ?? "",
                  kind: editing?.kind ?? "agreement",
                  description: editing?.description ?? "",
                  body: editing?.body ?? "",
                  position: String(editing?.position ?? templates.length),
                  requiredForAll: editing?.requiredForAll ?? false,
                  active: editing?.active ?? true,
                  pdf: editing?.hasPdf ? { filename: editing.filename ?? "document.pdf", size: bytes(editing.size ?? 0), href: `${base}/templates/${editing.id}/pdf` } : null,
                  signed: editing?.signed ?? 0,
                }}
              />
              {editing ? (
                <form action={deleteTemplateForm} className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
                  <input type="hidden" name="id" value={editing.id} />
                  <p className="text-[13px] text-muted-foreground">Deleting is only for templates nobody has a copy of. Otherwise it is turned off, and every signed copy stays.</p>
                  <SubmitButton variant="danger" size="sm" pendingText="Deleting..." confirm={`Delete “${editing.title}”? If anyone has a copy, it is turned off instead.`}>
                    Delete
                  </SubmitButton>
                </form>
              ) : null}
            </Section>
          ) : null}
          {editing?.body ? (
            <Section title="Preview" description="As experts see it before signing. The highlighted words are filled in from their profile and the sign form.">
              <div className="max-w-3xl">
                <DocumentBody blocks={bodyBlocks(editing.body)} />
              </div>
            </Section>
          ) : null}
          <Section title="Templates" description="A template for every expert waits on each expert's Documents page until they sign it. The others are sent to one expert at a time." flush>
            {templates.length ? (
              <Table>
                <THead>
                  <Th>Template</Th>
                  <Th>Kind</Th>
                  <Th>Content</Th>
                  <Th>Every expert</Th>
                  <Th>Active</Th>
                  <Th className="text-right">Signed</Th>
                  <Th className="text-right">Waiting</Th>
                </THead>
                <TBody>
                  {templates.map((t) => (
                    <Tr key={t.id} className={t.active ? undefined : "opacity-60"}>
                      <Td>
                        {canEdit ? (
                          <Link href={`${base}?tab=templates&edit=${t.id}`} className="font-medium text-foreground hover:text-primary">
                            {t.title}
                          </Link>
                        ) : (
                          <span className="font-medium text-foreground">{t.title}</span>
                        )}
                        {t.description ? <div className="max-w-md truncate text-xs text-muted-foreground">{t.description}</div> : null}
                      </Td>
                      <Td>{kindLabel(t.kind)}</Td>
                      <Td className="text-muted-foreground">
                        {t.hasPdf ? (
                          <a href={`${base}/templates/${t.id}/pdf`} target="_blank" rel="noopener" className="text-primary hover:underline">
                            PDF{t.size ? ` · ${bytes(t.size)}` : ""}
                          </a>
                        ) : t.hasBody ? (
                          "Text"
                        ) : (
                          "Empty"
                        )}
                      </Td>
                      <Td>{yesNo(t.requiredForAll)}</Td>
                      <Td>{yesNo(t.active)}</Td>
                      <Td className="tabular text-right">{t.signed}</Td>
                      <Td className="tabular text-right">{t.waiting}</Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            ) : (
              <EmptyState
                size="page"
                title="No templates yet"
                description="Double-click “Load default documents.bat” in the Expert Hub folder to add the NDA and the profile sharing consent, or add a template here."
                action={canEdit ? <ButtonLink href={`${base}?tab=templates&edit=new`}>New template</ButtonLink> : undefined}
              />
            )}
          </Section>
        </Stack>
      ) : null}

      {tab === "send" ? (
        <Stack>
          <Section title="Send a document to an expert" description="It goes on their Documents page in the portal, where they read and sign it. The portal sends no email: tell them yourself.">
            {canEdit ? (
              <form action={sendDocumentForm} className="space-y-5">
                <FieldRow>
                  <Field label="Expert's email" htmlFor="send-email" hint="The email on their profile (and their portal login).">
                    <Input id="send-email" name="email" type="email" required autoComplete="off" />
                  </Field>
                  <Field label="Due date" htmlFor="send-due" hint="Optional. Shown to them as “Due in 3 days”.">
                    <Input id="send-due" name="dueOn" type="date" min={today} />
                  </Field>
                </FieldRow>
                <Field label="Template" htmlFor="send-template" hint={choices.length ? "Or leave this empty and upload a PDF just for them." : "No active templates yet: upload a PDF just for them."}>
                  <Select id="send-template" name="templateId" defaultValue="" options={choices.map((c) => ({ value: c.id, label: `${c.title}${c.requiredForAll ? " (every expert)" : ""}` }))} placeholder="No template: upload a PDF below" />
                </Field>
                <Field label="Or a PDF just for them" htmlFor="send-pdf">
                  <FilePicker id="send-pdf" name="pdf" accept="application/pdf,.pdf" label="Upload a PDF" hint="PDF, up to 4 MB. Only when no template is chosen." />
                </Field>
                <FieldRow>
                  <Field label="Title" htmlFor="send-title" hint="What the expert sees. Empty: the template's title (needed for a PDF).">
                    <Input id="send-title" name="title" maxLength={200} />
                  </Field>
                  <Field label="Kind" htmlFor="send-kind" hint="For a PDF. A template keeps its own kind.">
                    <Select id="send-kind" name="kind" defaultValue="agreement" options={KIND_OPTIONS} />
                  </Field>
                </FieldRow>
                <Field label="Note" htmlFor="send-note" hint="For the team only. The expert never sees it.">
                  <Textarea id="send-note" name="note" rows={2} maxLength={2000} />
                </Field>
                <SubmitButton pendingText="Sending...">Send</SubmitButton>
              </form>
            ) : (
              <Notice tone="info">Your role can see documents but not send them. An admin or recruiter sends them.</Notice>
            )}
          </Section>
          <Section title="The link to give them" description="Experts sign in with the email on their profile, then open Documents.">
            <div className="flex flex-wrap items-center gap-3">
              <code className="rounded-sm bg-secondary px-2 py-1 text-[13px]">{PORTAL_DOCUMENTS_URL}</code>
              <CopyButton value={PORTAL_DOCUMENTS_URL} label="Copy link" />
            </div>
          </Section>
        </Stack>
      ) : null}

      {tab === "sent" ? (
        <Section title="Sent & signed" description="The latest 200, newest first. A template for every expert shows up here once someone signs it." flush>
          {sent.length ? (
            <Table sticky>
              <THead>
                <Th>Expert</Th>
                <Th>Document</Th>
                <Th>Status</Th>
                <Th>Sent</Th>
                <Th>Due</Th>
                <Th>Signed</Th>
                <Th>Method</Th>
                <Th>
                  <span className="sr-only">Record</span>
                </Th>
              </THead>
              <TBody>
                {sent.map((r) => (
                  <Tr key={r.id} className={r.status === "void" ? "opacity-60" : undefined}>
                    <Td>
                      <Link href={`/admin/experts/${r.expertId}?tab=documents`} className="font-medium text-foreground hover:text-primary">
                        {r.expertName}
                      </Link>
                      <div className="text-xs text-muted-foreground">{contact ? r.expertEmail : maskEmail(r.expertEmail)}</div>
                    </Td>
                    <Td>
                      <div className="max-w-64 truncate text-foreground">{r.title}</div>
                      <div className="text-xs text-muted-foreground">{kindLabel(r.kind)}</div>
                    </Td>
                    <Td>
                      <MapBadge value={r.status} labels={DOCUMENT_STATUS_LABELS} tones={DOCUMENT_STATUS_TONE} />
                      {r.status === "sent" ? <div className="mt-0.5 text-xs text-muted-foreground">{r.viewedAt ? `Opened ${istDay(r.viewedAt)}` : "Not opened yet"}</div> : null}
                    </Td>
                    <Td className="whitespace-nowrap">{r.sentAt ? istDay(r.sentAt) : <span className="text-muted-foreground/70">–</span>}</Td>
                    <Td className={r.status === "sent" && r.dueOn && r.dueOn < today ? "whitespace-nowrap text-warning" : "whitespace-nowrap"}>{r.dueOn ? fmtDate(r.dueOn) : <span className="text-muted-foreground/70">–</span>}</Td>
                    <Td className="whitespace-nowrap">{r.signedAt ? istDay(r.signedAt) : <span className="text-muted-foreground/70">–</span>}</Td>
                    <Td className="whitespace-nowrap text-muted-foreground">{r.signMethod ? (METHOD_SHORT[r.signMethod] ?? r.signMethod) : "–"}</Td>
                    <Td className="whitespace-nowrap text-right">
                      <a href={`${base}/${r.id}/print`} target="_blank" rel="noopener" className="text-small text-primary hover:underline">
                        View record
                      </a>
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          ) : (
            <EmptyState
              size="page"
              title="Nothing sent or signed yet"
              description="Documents sent to an expert, and every signature, show up here."
              action={canEdit ? <ButtonLink href={hrefWith(base, {}, { tab: "send" })}>Send to an expert</ButtonLink> : undefined}
            />
          )}
        </Section>
      ) : null}
    </>
  );
}
