"use client";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <EmptyState
      size="page"
      title="Something went wrong"
      description={`Try again. If it keeps happening, send this code to the developer: ${error.digest ?? "no code"}.`}
      action={<Button onClick={reset}>Try again</Button>}
    />
  );
}
