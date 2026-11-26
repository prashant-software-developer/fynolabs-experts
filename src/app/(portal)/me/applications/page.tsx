import { redirect } from "next/navigation";

/** Applications live on Home now (the Applications tab). */
export default function ApplicationsPage() {
  redirect("/me?tab=applications");
}
