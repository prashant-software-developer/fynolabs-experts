import Link from "next/link";
import { Mail } from "@/components/icons";
import { getDb } from "@/db/client";
import { can, canSeeContact } from "@/lib/auth/permissions";
import { requireSection } from "@/lib/auth/section-guard";
import { hrefWith, one, type SearchParams } from "@/lib/filters";
import { fmtDateTime } from "@/lib/format";
import { emailConfigured } from "@/lib/server/email";
import { MESSAGE_TABS, MESSAGE_TAB_LABELS, getMessage, listMessages, mailtoLink, type MessageTab } from "@/lib/server/messages";
import { replySettings, replyStarter } from "@/lib/server/reply-settings";
import { Facts, Initials } from "@/components/crm/chips";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink, buttonClass } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/client";
import { CopyButton } from "@/components/ui/copy-button";
import { EmptyState, FlashFromParams, NoAccess, Notice } from "@/components/ui/feedback";
import { Field, Input, Textarea } from "@/components/ui/field";
import { SearchField, Toolbar } from "@/components/ui/toolbar";
import { PageHeader, Section, Stack } from "@/components/ui/layout";
import { Pagination } from "@/components/ui/pagination";
import { SlideOver } from "@/components/ui/slide-over";
import { Tabs } from "@/components/ui/tabs";
import { removeMessage, replyToMessage, setMessageHandled } from "./actions";

export const metadata = { title: "Messages" };
const PAGE = 50;

export default async function MessagesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const { user, allowed } = await requireSection("messages");
  if (!allowed)
    return (
      <>
        <PageHeader title="Messages" />
        <Section>
          <NoAccess what="Messages" role={user.role} />
        </Section>
      </>
    );
  const db = await getDb();
  const tabRaw = one(sp.tab);
  const tab: MessageTab = (MESSAGE_TABS as readonly string[]).includes(tabRaw) ? (tabRaw as MessageTab) : "all";
  const q = one(sp.q);
  const page = Math.max(1, Math.floor(Number(one(sp.page)) || 1));
  const { rows, counts } = await listMessages(db, user.role, { tab, q, limit: PAGE, offset: (page - 1) * PAGE });
  const opened = one(sp.view) ? await getMessage(db, one(sp.view), user.role) : null;
  const manage = can(user.role, "messages.manage");
  const mailReady = emailConfigured();
  const reply = opened && manage ? await replySettings(db) : null;
  const close = hrefWith("/admin/messages", sp, { view: null, ok: null, error: null });
  const here = hrefWith("/admin/messages", sp, { ok: null, error: null });
  const subject = opened?.draft?.subject || "Re: your message to FynoLabs";
  const body = opened ? opened.draft?.body || (reply ? replyStarter(opened.message.name, reply.values.reply_signoff) : "") : "";

  return (
    <>
      <PageHeader title="Messages" subtitle="What people sent through the website's contact form." />
      <FlashFromParams ok={one(sp.ok)} error={one(sp.error)} />
      <Tabs tabs={MESSAGE_TABS.map((t) => ({ href: hrefWith("/admin/messages", sp, { tab: t === "all" ? null : t, page: null, view: null, ok: null, error: null }), label: MESSAGE_TAB_LABELS[t], active: tab === t, count: counts[t] }))} />
      <Section flush>
        <Toolbar hidden={{ tab: tab !== "all" ? tab : null }} clearHref={q ? hrefWith("/admin/messages", sp, { q: null, page: null }) : null}>
          <SearchField defaultValue={q} placeholder="Search messages" label="Search messages" className="sm:w-96" />
        </Toolbar>
        {rows.length ? (
          <>
            <ul className="divide-y divide-border">
              {rows.map((m) => (
                <li key={m.id} className="row-hover relative flex gap-4 px-6 py-4">
                  <Initials name={m.name} size="lg" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <Link href={hrefWith("/admin/messages", sp, { view: m.id, ok: null, error: null })} scroll={false} className="text-[15px] font-medium text-foreground after:absolute after:inset-0 hover:text-primary">
                        {m.name}
                      </Link>
                      <span className="text-[13px] text-muted-foreground">
                        {m.email} · {fmtDateTime(m.createdAt)}
                      </span>
                      <span className="ml-auto">{m.handledAt ? <Badge tone="muted" pill dot>Handled</Badge> : <Badge tone="info" pill dot>New</Badge>}</span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-small text-foreground/80">{m.message}</p>
                  </div>
                </li>
              ))}
            </ul>
            <Pagination page={page} pageSize={PAGE} total={counts[tab]} hrefFor={(p) => hrefWith("/admin/messages", sp, { page: p, view: null, ok: null, error: null })} />
          </>
        ) : (
          <EmptyState size="page" icon={Mail} title={counts.all || q ? "No messages match this view." : "No messages yet."} description={counts.all || q ? "Try another tab or a shorter search." : "Messages from the website's contact form land here."} />
        )}
      </Section>
      {!canSeeContact(user.role) ? <p className="mt-3 text-[13px] text-muted-foreground">Email addresses are masked for your role.</p> : null}

      {opened ? (
        <SlideOver
          title="Message"
          closeHref={close}
          footer={
            <div className="flex flex-wrap items-center gap-2">
              {manage ? (
                <form action={setMessageHandled}>
                  <input type="hidden" name="id" value={opened.message.id} />
                  <input type="hidden" name="handled" value={opened.message.handledAt ? "no" : "yes"} />
                  <input type="hidden" name="returnTo" value={here} />
                  <SubmitButton size="sm" variant={opened.message.handledAt ? "secondary" : "primary"}>
                    {opened.message.handledAt ? "Mark as open" : "Mark as handled"}
                  </SubmitButton>
                </form>
              ) : null}
              {can(user.role, "crm.delete") ? (
                <form action={removeMessage} className="ml-auto">
                  <input type="hidden" name="id" value={opened.message.id} />
                  <input type="hidden" name="returnTo" value={close} />
                  <SubmitButton size="sm" variant="ghost" className="text-danger" confirm="Delete this message for good?">
                    Delete
                  </SubmitButton>
                </form>
              ) : null}
            </div>
          }
        >
          <Stack>
            <div className="flex items-center gap-3">
              <Initials name={opened.message.name} className="h-10 w-10 text-sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-lg text-foreground">{opened.message.name}</p>
                <p className="text-small text-muted-foreground">Message from the website</p>
              </div>
              {opened.message.handledAt ? <Badge tone="muted" pill dot>Handled</Badge> : <Badge tone="info" pill dot>New</Badge>}
            </div>
            <Facts
              items={[
                { label: "Email", value: <span className="flex flex-wrap items-center gap-2"><span className="break-all">{opened.message.email}</span>{opened.rawEmail ? <CopyButton value={opened.rawEmail} label="Copy" /> : null}</span> },
                { label: "Received", value: fmtDateTime(opened.message.createdAt) },
                { label: "Handled", value: opened.message.handledAt ? `${fmtDateTime(opened.message.handledAt)}${opened.message.handledBy ? ` by ${opened.message.handledBy.split("@")[0]}` : ""}` : null },
              ]}
            />
            <div>
              <p className="eyebrow mb-1.5 text-muted-foreground">Message</p>
              <p className="rounded-md border border-border bg-muted/40 p-4 text-sm whitespace-pre-line text-foreground/90">{opened.message.message}</p>
            </div>

            {manage ? (
              <div className="space-y-4">
                <p className="eyebrow text-muted-foreground">Reply</p>
                {!mailReady ? (
                  <Notice tone="warning" title="Email isn't set up yet">
                    Sending from here is off. Write the reply, save it as a draft, then copy it or open it in your email app (pick hello@fynolabs.si as the From address) and press <strong>I sent it</strong> to record it.
                  </Notice>
                ) : null}
                <form action={replyToMessage} className="space-y-3">
                  <input type="hidden" name="id" value={opened.message.id} />
                  <input type="hidden" name="returnTo" value={here} />
                  <p className="text-small text-muted-foreground">
                    To: {opened.message.name} &lt;{opened.message.email}&gt;
                  </p>
                  <Field label="Subject" htmlFor="r-subject">
                    <Input id="r-subject" name="subject" defaultValue={subject} maxLength={300} />
                  </Field>
                  <Field label="Message" htmlFor="r-body" hint={opened.draft ? `Draft saved ${fmtDateTime(opened.draft.updatedAt)}.` : "Starts with their first name and your sign-off (Settings → Email replies)."}>
                    <Textarea id="r-body" name="body" rows={10} defaultValue={body} placeholder="Write your message" />
                  </Field>
                  <div className="flex flex-wrap items-center gap-2">
                    <SubmitButton name="intent" value="draft" variant="secondary" size="sm">
                      Save draft
                    </SubmitButton>
                    {mailReady ? (
                      <SubmitButton name="intent" value="send" size="sm" confirm={`Send this reply to ${opened.message.email}?`}>
                        Send
                      </SubmitButton>
                    ) : (
                      <SubmitButton name="intent" value="logged" size="sm">
                        I sent it
                      </SubmitButton>
                    )}
                    {opened.draft ? (
                      <SubmitButton name="intent" value="discard" variant="ghost" size="sm" className="text-muted-foreground">
                        Discard draft
                      </SubmitButton>
                    ) : null}
                  </div>
                </form>
                {opened.rawEmail ? (
                  <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
                    <span className="text-small text-muted-foreground">The saved draft:</span>
                    <CopyButton value={`${subject}\n\n${body}`} label="Copy reply" />
                    <a href={mailtoLink(opened.rawEmail, subject, body)} className={buttonClass("secondary", "sm")}>
                      Open in email app
                    </a>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div>
              <p className="eyebrow mb-2 text-muted-foreground">Previous replies ({opened.replies.length})</p>
              {opened.replies.length ? (
                <ul className="space-y-2">
                  {opened.replies.map((r) => (
                    <li key={r.id} className="rounded-md border border-border">
                      <details>
                        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 px-4 py-3 [&::-webkit-details-marker]:hidden">
                          <span className="text-sm font-medium text-foreground">{r.subject}</span>
                          <span className="text-[13px] text-muted-foreground">
                            {fmtDateTime(r.createdAt)}
                            {r.sentBy ? ` · ${r.sentBy.split("@")[0]}` : ""}
                          </span>
                          {r.status !== "sent" ? <Badge tone="danger" pill dot>{r.status === "suppressed" ? "Not delivered" : "Failed"}</Badge> : null}
                        </summary>
                        <p className="border-t border-border px-4 py-3 text-small whitespace-pre-line text-foreground/85">{r.body}</p>
                      </details>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title="No replies yet." padded={false} />
              )}
            </div>
            {!manage ? <ButtonLink href={close} size="sm">Close</ButtonLink> : null}
          </Stack>
        </SlideOver>
      ) : null}
    </>
  );
}
