"use client";
// Team & access forms that hand out a temporary password. The password arrives once, in the
// action's answer, and is shown here with a copy button; it is never stored in plain text.
import { useActionState } from "react";
import { KeyRound } from "lucide-react";
import { addTeamMember, resetTeamPassword, type TempPasswordState } from "@/app/admin/settings/team/actions";
import { CopyButton } from "@/components/ui/copy-button";
import { SubmitButton } from "@/components/ui/client";
import { Notice } from "@/components/ui/feedback";
import { Checkbox, Field, FieldRow, Input, Select } from "@/components/ui/field";

export function TempPasswordBox({ email, password, signInUrl, note }: { email: string; password: string; signInUrl: string; note?: string }) {
  return (
    <div className="space-y-4 rounded-md border border-primary/30 bg-primary/[0.04] px-5 py-5" role="status">
      <div className="flex items-start gap-3">
        <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium text-foreground">Temporary password for {email}</p>
          <p className="text-[13px] leading-relaxed text-muted-foreground">Copy it now: it won&apos;t be shown again. Give it to them privately (not in a shared channel). They choose their own password when they first sign in.</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input readOnly value={password} aria-label={`Temporary password for ${email}`} className="control h-10 max-w-xs flex-1 font-mono text-[15px] tracking-wide" onFocus={(e) => e.currentTarget.select()} />
        <CopyButton value={password} label="Copy password" size="md" />
      </div>
      <p className="text-[13px] text-muted-foreground">
        Sign-in page: <span className="text-foreground">{signInUrl}</span>
      </p>
      {note ? <Notice tone="info">{note}</Notice> : null}
    </div>
  );
}

export function AddMemberForm({ roles, partners, domain, signInUrl }: { roles: { value: string; label: string }[]; partners: { id: string; name: string }[]; domain: string; signInUrl: string }) {
  const [state, action] = useActionState<TempPasswordState, FormData>(addTeamMember, {});
  return (
    <div className="space-y-5">
      {state.tempPassword && state.email ? <TempPasswordBox email={state.email} password={state.tempPassword} signInUrl={signInUrl} note={state.note} /> : null}
      {state.error ? <Notice tone="error">{state.error}</Notice> : null}
      <form action={action} className="space-y-4" key={state.tempPassword ?? "form"}>
        <FieldRow>
          <Field label="Email" htmlFor="tm-email">
            <Input id="tm-email" name="email" type="email" required placeholder={`name@${domain}`} autoComplete="off" defaultValue={state.values?.email} />
          </Field>
          <Field label="Name" htmlFor="tm-name">
            <Input id="tm-name" name="name" autoComplete="off" defaultValue={state.values?.name} />
          </Field>
        </FieldRow>
        <FieldRow>
          <Field label="Role" htmlFor="tm-role">
            <Select id="tm-role" name="role" defaultValue={state.values?.role || "recruiter"} options={roles} />
          </Field>
          <div />
        </FieldRow>
        {partners.length ? (
          <fieldset className="space-y-2">
            <legend className="text-[13px] font-medium text-foreground/80">Partner scope (pod leads only)</legend>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {partners.map((p) => (
                <Checkbox key={p.id} name="partnerIds" value={p.id} label={p.name} />
              ))}
            </div>
          </fieldset>
        ) : null}
        <SubmitButton pendingText="Adding...">Add member</SubmitButton>
      </form>
    </div>
  );
}

export function ResetPasswordForm({ id, email, signInUrl }: { id: string; email: string; signInUrl: string }) {
  const [state, action] = useActionState<TempPasswordState, FormData>(resetTeamPassword, {});
  if (state.tempPassword) return <TempPasswordBox email={email} password={state.tempPassword} signInUrl={signInUrl} />;
  return (
    <form action={action} className="space-y-4">
      {state.error ? <Notice tone="error">{state.error}</Notice> : null}
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="email" value={email} />
      <p className="text-sm leading-relaxed text-muted-foreground">This makes a new temporary password and signs {email} out everywhere. Their old password stops working at once.</p>
      <SubmitButton pendingText="Making a password..." confirm={`Reset the password for ${email}? They are signed out everywhere.`}>
        Make a temporary password
      </SubmitButton>
    </form>
  );
}
