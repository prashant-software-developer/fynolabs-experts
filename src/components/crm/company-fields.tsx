// The account form's fields (new account panel and the account page).
import { BUSINESS_LINES, COMPANY_PRIORITIES, COMPANY_STAGES, PARTNER_KINDS, label } from "@/lib/constants";
import { crmLabel } from "@/lib/crm/labels";
import type { CompanyRow, TeamOption } from "@/lib/server/companies";
import { Field, FieldRow, Input, Select, Textarea } from "@/components/ui/field";

export const kindOptions = PARTNER_KINDS.map((k) => ({ value: k, label: label(k) }));
export const stageOptions = COMPANY_STAGES.map((s) => ({ value: s, label: crmLabel(s) }));
export const lineOptions = BUSINESS_LINES.map((s) => ({ value: s, label: crmLabel(s) }));
export const priorityOptions = COMPANY_PRIORITIES.map((s) => ({ value: s, label: crmLabel(s) }));

export function ownerSelectValue(c: Pick<CompanyRow, "ownerTeamMemberId" | "ownerName"> | null, meId: string | null): string {
  if (!c) return meId ? `tm:${meId}` : "none";
  if (c.ownerTeamMemberId) return `tm:${c.ownerTeamMemberId}`;
  if (c.ownerName) return "other";
  return "none";
}

/** Owner: a teammate with a login ("You" for yourself), "Someone else…" with a typed name, or no owner. */
export function OwnerField({ team, meId, value, typedName, id }: { team: TeamOption[]; meId: string | null; value: string; typedName?: string | null; id: string }) {
  const options = [
    ...team.filter((m) => m.active || `tm:${m.id}` === value).map((m) => ({ value: `tm:${m.id}`, label: m.id === meId ? "You" : m.name || m.email.split("@")[0] })),
    { value: "other", label: "Someone else…" },
    { value: "none", label: "No owner" },
  ];
  return (
    <FieldRow>
      <Field label="Owner" htmlFor={`${id}-owner`} hint="Who sends the next step.">
        <Select id={`${id}-owner`} name="owner" defaultValue={value} options={options} />
      </Field>
      <Field label="Someone else's name" htmlFor={`${id}-ownerName`} hint="Teammates without a login yet: pick Someone else and type their name.">
        <Input id={`${id}-ownerName`} name="ownerName" defaultValue={typedName ?? ""} placeholder="Their name" />
      </Field>
    </FieldRow>
  );
}

export function NewAccountFields({ team, meId }: { team: TeamOption[]; meId: string | null }) {
  return (
    <div className="space-y-4">
      <Field label="Company" htmlFor="new-name">
        <Input id="new-name" name="name" required maxLength={120} autoFocus />
      </Field>
      <FieldRow>
        <Field label="Type" htmlFor="new-kind">
          <Select id="new-kind" name="kind" defaultValue="data_partner" options={kindOptions} />
        </Field>
        <Field label="Business line" htmlFor="new-line">
          <Select id="new-line" name="businessLine" defaultValue="ai_training" options={lineOptions} />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Stage" htmlFor="new-stage">
          <Select id="new-stage" name="stage" defaultValue="researching" options={stageOptions} />
        </Field>
        <Field label="Website" htmlFor="new-website">
          <Input id="new-website" name="website" placeholder="company.com" />
        </Field>
      </FieldRow>
      <OwnerField team={team} meId={meId} value={ownerSelectValue(null, meId)} id="new" />
    </div>
  );
}

export function NextStepFields({ c, team, meId }: { c: CompanyRow; team: TeamOption[]; meId: string | null }) {
  return (
    <div className="space-y-4">
      <Field label="Next step" htmlFor="c-next">
        <Textarea id="c-next" name="nextStep" rows={3} defaultValue={c.nextStep ?? ""} placeholder="What happens next, and who sends it" />
      </Field>
      <FieldRow>
        <Field label="Stage" htmlFor="c-stage" hint="Researching → Drafted → Contacted → Talking → Pilot → Active, or On hold / Dropped. A change is logged in Activity.">
          <Select id="c-stage" name="stage" defaultValue={c.stage} options={stageOptions} />
        </Field>
        <Field label="Due" htmlFor="c-due">
          <Input id="c-due" name="nextStepDue" type="date" defaultValue={c.nextStepDue ?? ""} />
        </Field>
      </FieldRow>
      <OwnerField team={team} meId={meId} value={ownerSelectValue(c, meId)} typedName={c.ownerName} id="c" />
      <Field label="Best route" htmlFor="c-route" hint="How to reach them: an email thread, a form, a LinkedIn contact, an intro.">
        <Input id="c-route" name="bestRoute" defaultValue={c.bestRoute ?? ""} />
      </Field>
    </div>
  );
}

export function DetailFields({ c, platforms }: { c: CompanyRow; platforms: { id: string; name: string }[] }) {
  return (
    <div className="space-y-4">
      <FieldRow>
        <Field label="Company" htmlFor="d-name">
          <Input id="d-name" name="name" defaultValue={c.name} required maxLength={120} />
        </Field>
        <Field label="Priority" htmlFor="d-priority">
          <Select id="d-priority" name="priority" defaultValue={c.priority} options={priorityOptions} />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Type" htmlFor="d-kind">
          <Select id="d-kind" name="kind" defaultValue={c.kind} options={kindOptions} />
        </Field>
        <Field label="Business line" htmlFor="d-line">
          <Select id="d-line" name="businessLine" defaultValue={c.businessLine} options={lineOptions} />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Website" htmlFor="d-web">
          <Input id="d-web" name="website" defaultValue={c.website ?? ""} placeholder="company.com" />
        </Field>
        <Field label="Location" htmlFor="d-loc">
          <Input id="d-loc" name="location" defaultValue={c.location ?? ""} placeholder="City, country" />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="On Platforms" htmlFor="d-platform" hint="Link the matching platform or agency record, if we also refer people there.">
          <Select id="d-platform" name="platformId" defaultValue={c.platformId ?? ""} options={platforms.map((p) => ({ value: p.id, label: p.name }))} placeholder="Not linked" />
        </Field>
        <Field label="Tags" htmlFor="d-tags" hint="Comma separated, e.g. boardy, coding, india.">
          <Input id="d-tags" name="tags" defaultValue={c.tags.join(", ")} />
        </Field>
      </FieldRow>
      <Field label="Notes" htmlFor="d-notes">
        <Textarea id="d-notes" name="notes" rows={5} defaultValue={c.notes ?? ""} placeholder="What they do, what they need, terms, risks." />
      </Field>
    </div>
  );
}
