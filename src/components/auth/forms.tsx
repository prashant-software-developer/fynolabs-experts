"use client";
// The sign-in, sign-up, verification and password forms. Each posts to a server action in
// src/app/(auth)/actions.ts and shows its answer in place; nothing is checked only in the browser.
import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { chooseNewPassword, forgotPassword, sendNewCode, signInWithPassword, signUp, updatePassword, verifyWithCode, type AuthFormState } from "@/app/(auth)/actions";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password-policy";
import { buttonClass } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Notice } from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { PasswordInput } from "./password-input";

function Submit({ children, pending: pendingText, variant = "primary" }: { children: React.ReactNode; pending: string; variant?: "primary" | "secondary" }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={buttonClass(variant, "md", "h-11 w-full")}>
      {pending ? (
        <>
          <Spinner className="h-3.5 w-3.5" />
          {pendingText}
        </>
      ) : (
        children
      )}
    </button>
  );
}

function EmailInput({ defaultValue, invalid, autoFocus, describedBy }: { defaultValue?: string; invalid?: boolean; autoFocus?: boolean; describedBy?: string }) {
  return (
    // Password managers and browser autofill add inline styles before React hydrates.
    <input
      suppressHydrationWarning
      id="email"
      name="email"
      type="email"
      required
      autoComplete="email"
      autoCapitalize="none"
      spellCheck={false}
      inputMode="email"
      maxLength={254}
      defaultValue={defaultValue}
      autoFocus={autoFocus}
      placeholder="you@example.com"
      className="control h-11"
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
    />
  );
}

const PW_HINT = `At least ${MIN_PASSWORD_LENGTH} characters. Not your email, and not a common password.`;

export function SignInForm({ callbackUrl, email }: { callbackUrl: string | null; email?: string }) {
  const [state, action] = useActionState<AuthFormState, FormData>(signInWithPassword, {});
  return (
    <form action={action} className="space-y-4" noValidate>
      {state.error ? <Notice tone="error">{state.error}</Notice> : null}
      {callbackUrl ? <input type="hidden" name="callbackUrl" value={callbackUrl} /> : null}
      <Field label="Email" htmlFor="email">
        <EmailInput defaultValue={state.values?.email ?? email} autoFocus={!email} />
      </Field>
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor="password" className="block text-[13px] font-medium text-foreground/80">
            Password
          </label>
          <Link href="/forgot-password" className="text-[13px] text-primary underline-offset-4 hover:underline">
            Forgot password?
          </Link>
        </div>
        <PasswordInput id="password" name="password" autoComplete="current-password" autoFocus={Boolean(email)} />
      </div>
      <Submit pending="Signing in...">Sign in</Submit>
    </form>
  );
}

export function SignUpForm({ callbackUrl, consentText }: { callbackUrl: string | null; consentText: string }) {
  const [state, action] = useActionState<AuthFormState, FormData>(signUp, {});
  const e = state.errors ?? {};
  return (
    <form action={action} className="space-y-4" noValidate>
      {state.error ? <Notice tone="error">{state.error}</Notice> : null}
      {callbackUrl ? <input type="hidden" name="callbackUrl" value={callbackUrl} /> : null}
      <Field label="Full name" htmlFor="name" error={e.name}>
        <input id="name" name="name" required autoComplete="name" maxLength={120} defaultValue={state.values?.name} className="control h-11" aria-invalid={e.name ? true : undefined} />
      </Field>
      <Field label="Email" htmlFor="email" error={e.email} hint="We'll send a code to confirm it.">
        <EmailInput defaultValue={state.values?.email} invalid={Boolean(e.email)} />
      </Field>
      <Field label="Password" htmlFor="password" error={e.password} hint={PW_HINT}>
        <PasswordInput id="password" name="password" autoComplete="new-password" strength invalid={Boolean(e.password)} />
      </Field>
      <Field label="Password again" htmlFor="password2" error={e.password2}>
        <PasswordInput id="password2" name="password2" autoComplete="new-password" invalid={Boolean(e.password2)} />
      </Field>
      <div className="space-y-1.5">
        <label className="flex cursor-pointer items-start gap-3 text-[13px] leading-relaxed text-foreground/85">
          <input type="checkbox" name="consent" value="yes" required className="mt-0.5 h-4 w-4 shrink-0 rounded-sm border-input" aria-invalid={e.consent ? true : undefined} />
          <span>{consentText}</span>
        </label>
        {e.consent ? <p className="text-xs text-destructive">{e.consent}</p> : null}
      </div>
      <Submit pending="Creating your account...">Create account</Submit>
    </form>
  );
}

export function VerifyForm({ email, next }: { email: string | null; next: string | null }) {
  const [state, action] = useActionState<AuthFormState, FormData>(verifyWithCode, {});
  const [resent, resend] = useActionState<AuthFormState, FormData>(sendNewCode, {});
  const knownEmail = state.values?.email || email || "";
  return (
    <div className="space-y-5">
      <form action={action} className="space-y-4" noValidate>
        {state.error ? <Notice tone="error">{state.error}</Notice> : null}
        {resent.ok ? <Notice tone="success">{resent.ok}</Notice> : null}
        {next ? <input type="hidden" name="next" value={next} /> : null}
        {email ? (
          <input type="hidden" name="email" value={email} />
        ) : (
          <Field label="Email" htmlFor="email">
            <EmailInput defaultValue={knownEmail} />
          </Field>
        )}
        <Field label="6-digit code" htmlFor="code">
          <input
            id="code"
            name="code"
            required
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 ]{6,7}"
            maxLength={7}
            autoFocus
            placeholder="123456"
            className="control h-12 text-center text-lg tracking-[0.4em] tabular-nums"
          />
        </Field>
        <Submit pending="Checking...">Confirm email</Submit>
      </form>
      <form action={resend} className="text-center">
        <input type="hidden" name="email" value={knownEmail} />
        <ResendButton />
      </form>
    </div>
  );
}

function ResendButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="inline-flex items-center gap-1.5 text-[13px] text-primary underline-offset-4 hover:underline disabled:opacity-50">
      {pending ? (
        <>
          <Spinner className="h-3 w-3" /> Sending…
        </>
      ) : (
        "Send a new code"
      )}
    </button>
  );
}

/** The emailed link: one button, so link scanners that open emails can't use it up. */
export function VerifyLinkForm({ token, next }: { token: string; next: string | null }) {
  const [state, action] = useActionState<AuthFormState, FormData>(verifyWithCode, {});
  return (
    <form action={action} className="space-y-4">
      {state.error ? <Notice tone="error">{state.error}</Notice> : null}
      <input type="hidden" name="token" value={token} />
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <Submit pending="Confirming...">Confirm my email</Submit>
    </form>
  );
}

export function ForgotForm() {
  const [state, action] = useActionState<AuthFormState, FormData>(forgotPassword, {});
  if (state.ok) {
    return (
      <div className="space-y-4">
        <Notice tone="success" title="Check your email">
          {state.ok}
        </Notice>
        <Link href="/signin" className={buttonClass("secondary", "md", "h-11 w-full")}>
          Back to sign in
        </Link>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-4" noValidate>
      <Field label="Email" htmlFor="email" error={state.errors?.email}>
        <EmailInput defaultValue={state.values?.email} autoFocus invalid={Boolean(state.errors?.email)} />
      </Field>
      <Submit pending="Sending...">Email me a reset link</Submit>
    </form>
  );
}

export function ResetForm({ token }: { token: string }) {
  const [state, action] = useActionState<AuthFormState, FormData>(chooseNewPassword, {});
  const e = state.errors ?? {};
  return (
    <form action={action} className="space-y-4" noValidate>
      {state.error ? <Notice tone="error">{state.error}</Notice> : null}
      <input type="hidden" name="token" value={token} />
      <Field label="New password" htmlFor="password" error={e.password} hint={PW_HINT}>
        <PasswordInput id="password" name="password" autoComplete="new-password" strength autoFocus invalid={Boolean(e.password)} />
      </Field>
      <Field label="New password again" htmlFor="password2" error={e.password2}>
        <PasswordInput id="password2" name="password2" autoComplete="new-password" invalid={Boolean(e.password2)} />
      </Field>
      <Submit pending="Saving...">Save new password</Submit>
    </form>
  );
}

export function ChangePasswordForm({ hasPassword, temporary, next }: { hasPassword: boolean; temporary: boolean; next: string | null }) {
  const [state, action] = useActionState<AuthFormState, FormData>(updatePassword, {});
  const e = state.errors ?? {};
  return (
    <form action={action} className="space-y-4" noValidate>
      {state.error ? <Notice tone="error">{state.error}</Notice> : null}
      {next ? <input type="hidden" name="next" value={next} /> : null}
      {hasPassword ? (
        <Field label={temporary ? "Temporary password" : "Current password"} htmlFor="current" error={e.current}>
          <PasswordInput id="current" name="current" autoComplete="current-password" autoFocus invalid={Boolean(e.current)} />
        </Field>
      ) : null}
      <Field label="New password" htmlFor="password" error={e.password} hint={PW_HINT}>
        <PasswordInput id="password" name="password" autoComplete="new-password" strength autoFocus={!hasPassword} invalid={Boolean(e.password)} />
      </Field>
      <Field label="New password again" htmlFor="password2" error={e.password2}>
        <PasswordInput id="password2" name="password2" autoComplete="new-password" invalid={Boolean(e.password2)} />
      </Field>
      <Submit pending="Saving...">{hasPassword ? "Change password" : "Set password"}</Submit>
    </form>
  );
}
