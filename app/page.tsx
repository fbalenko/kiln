import { redirect } from "next/navigation";

// Per docs/05-ui-ux.md §Tier 1: there is no marketing landing page.
// The root URL redirects directly into the working pipeline.
export default function RootPage() {
  redirect("/pipeline");
}
