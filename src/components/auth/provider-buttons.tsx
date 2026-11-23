// "Continue with Google / LinkedIn", only for the providers whose keys are set.
import { signInWithProvider } from "@/app/(auth)/actions";
import type { OAuthMethod } from "@/auth.config";
import { GoogleButton, LinkedInButton } from "@/components/site/sign-in-buttons";

export function ProviderButtons({ methods, callbackUrl, verb = "Continue" }: { methods: OAuthMethod[]; callbackUrl: string | null; verb?: string }) {
  if (!methods.length) return null;
  return (
    <div className="space-y-3">
      {methods.map((m) => (
        <form key={m} action={signInWithProvider}>
          <input type="hidden" name="provider" value={m} />
          {callbackUrl ? <input type="hidden" name="callbackUrl" value={callbackUrl} /> : null}
          {m === "google" ? <GoogleButton label={`${verb} with Google`} /> : <LinkedInButton label={`${verb} with LinkedIn`} />}
        </form>
      ))}
    </div>
  );
}
