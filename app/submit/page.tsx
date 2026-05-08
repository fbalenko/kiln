import type { Metadata } from "next";
import { VisitorSubmitForm } from "./visitor-submit-form";

// Tier 3 entry: visitor-submitted deal. The form lives at /submit and
// posts to /api/submit-deal. On success the API mints a session cookie
// + a visitor-{sessionId} deal id and the form redirects the visitor to
// /deals/visitor-{sessionId}, where the orchestrator auto-fires.
//
// Server component is intentionally thin — it just renders the page
// title and hands off to <VisitorSubmitForm>, which carries all the
// interactive state.

export const metadata: Metadata = {
  title: "Submit your own deal · Kiln",
  description:
    "Submit a deal to Kiln. The agent pipeline will run live on your inputs and post the result to the demo Slack workspace.",
};

export default function SubmitPage() {
  return (
    <main className="mx-auto w-full max-w-[720px] flex-1 px-4 pb-20 pt-6 sm:px-6 sm:pt-8">
      <header className="mb-6 sm:mb-7">
        <h1 className="text-[18px] font-semibold leading-tight text-foreground sm:text-[20px]">
          Submit your own deal
        </h1>
        <p className="mt-1.5 max-w-prose text-[12.5px] leading-relaxed text-muted-foreground">
          Drop in a deal — real or invented — and Kiln runs the same
          six-agent review used on the seeded scenarios. Pricing,
          ASC&nbsp;606, redline, approval, and comms outputs land on
          your screen in under a minute and a summary posts to the
          demo Slack workspace.
        </p>
      </header>
      <VisitorSubmitForm />
    </main>
  );
}
