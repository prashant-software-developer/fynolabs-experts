"use client";
import { ROLES, ROLE_LABELS, type Role } from "@/lib/auth/permissions";
import { setDevRole } from "@/app/(app)/dev-actions";

/** Local development only (rendered when the dev sign-in bypass is on): preview the app as any role. */
export function DevRoleSwitcher({ current }: { current: Role }) {
  return (
    <form action={setDevRole} className="flex items-center gap-1.5">
      <label htmlFor="dev-role" className="hidden text-xs text-muted-foreground xl:inline">
        Preview as
      </label>
      <select
        id="dev-role"
        name="role"
        defaultValue={current}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="control h-8 w-auto border-dashed text-[13px]"
        aria-label="Preview as role (local development only)"
      >
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABELS[r]}
          </option>
        ))}
      </select>
    </form>
  );
}
