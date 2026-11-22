import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";

export default function NotFound() {
  return <EmptyState size="page" title="Not found" description="It may have been deleted, or the link is wrong." action={<ButtonLink href="/">Back to the dashboard</ButtonLink>} />;
}
