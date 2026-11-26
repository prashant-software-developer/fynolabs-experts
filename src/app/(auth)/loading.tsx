import { PageLoader } from "@/components/ui/spinner";

/** Shown while the page loads: the app's one loader, centred in the page area. */
export default function Loading() {
  return <PageLoader className="min-h-[40vh]" />;
}
