"use client";
import { ROLES, ROLE_LABELS, type Role } from "@/lib/auth/permissions";
import { setDevRole } from "@/app/dev-actions";

/** Local development only (rendered when the dev sign-in bypass is on): preview the app as any role, the demo expert, or signed out. */
export function DevRoleSwitcher({ current, compact }: { current: Role | "expert" | "guest"; compact?: boolean }) {
  return (
    <form action={setDevRole} className="flex items-center gap-1.5">
      <label htmlFor="dev-role" className={compact ? "sr-only" : "hidden text-xs text-muted-foreground xl:inline"}>
        Preview as
      </label>
      <select
        id="dev-role"
        name="role"
        defaultValue={current}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="control h-8 w-auto border-dashed text-[13px]"
        aria-label="Preview as (local development only)"
      >
        <optgroup label="Team">
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </optgroup>
        <optgroup label="Public">
          <option value="expert">Expert (portal)</option>
          <option value="guest">Signed out (guest)</option>
        </optgroup>
      </select>
    </form>
  );
}
