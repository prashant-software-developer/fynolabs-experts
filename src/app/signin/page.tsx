import { redirect } from "next/navigation";
import { signIn } from "@/auth";
import { authSettings, isDevBypass } from "@/lib/auth/allow";
import { getCurrentUser } from "@/lib/auth/session";
import { Notice } from "@/components/ui/feedback";

export const metadata = { title: "Sign in" };

function safeBack(raw: string | undefined): string {
  return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
}

export default async function SignInPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const back = safeBack(sp.callbackUrl);
  if (isDevBypass() || (await getCurrentUser())) redirect(back);
  const { domain } = authSettings();
  const error = sp.error;
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-8">
        <div className="space-y-2 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="" className="mx-auto h-10 w-10" />
          <h1 className="text-xl font-semibold text-slate-900">Expert Hub</h1>
          <p className="text-sm text-slate-500">Sign in with your @{domain} Google account.</p>
        </div>
        {error ? (
          <Notice tone="error">
            {error === "AccessDenied"
              ? `That account can't use Expert Hub. Use a verified @${domain} Google account.`
              : "Sign-in didn't work. Try again."}
          </Notice>
        ) : null}
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: back });
          }}
        >
          <button className="flex h-11 w-full items-center justify-center gap-3 rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50">
            <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
              <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8z" />
              <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z" />
              <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1z" />
              <path fill="#EA4335" d="M12 4.8c1.8 0 3.4.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z" />
            </svg>
            Continue with Google
          </button>
        </form>
        <p className="text-center text-xs text-slate-400">Internal tool. Access is limited to the core team.</p>
      </div>
    </main>
  );
}
