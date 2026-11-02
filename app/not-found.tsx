import Link from "next/link";
import PageShell from "@/components/layout/PageShell";
import Button from "@/components/ui/Button";

export default function NotFound() {
  return (
    <PageShell pageTitle="Scale Unbalanced · 404">
      <div className="max-w-md mx-auto p-8 text-center rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-surface)] space-y-4 my-8">
        <div
          className="text-[32px] font-bold text-[var(--accent)]"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          404
        </div>
        <h2
          className="text-[17px] font-bold"
          style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}
        >
          Poll Fulcrum Not Found
        </h2>
        <p className="text-[13px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          The requested poll scale or route does not exist on this network or has expired.
        </p>
        <div className="pt-2">
          <Link href="/" className="no-underline">
            <Button size="md">
              Return to Polls
            </Button>
          </Link>
        </div>
      </div>
    </PageShell>
  );
}
