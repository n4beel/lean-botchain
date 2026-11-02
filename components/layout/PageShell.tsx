"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ConnectButton from "@/components/ui/ConnectButton";
import NetworkBadge from "@/components/botchain/NetworkBadge";
import { footerLinks } from "@/lib/botchain/chain";
import BuiltOnBotChain from "@/components/botchain/BuiltOnBotChain";
import { app } from "@/lib/app-config";

export type NavItem = { href: string; label: string };

/* ── Tilt fulcrum diamond ─────────────────────────────────────────────────
 * Visual anchor for the Tilt archetype. A coral rotated square placed at
 * the brand mark and in the footer as the "built-on" indicator.
 */
function Diamond({ px = 8 }: { px?: number }) {
  return (
    <span
      aria-hidden
      style={{
        display: "inline-block",
        width: px,
        height: px,
        background: "var(--accent)",
        transform: "rotate(45deg)",
        flexShrink: 0,
      }}
    />
  );
}

/* ── Conviction tab strip ─────────────────────────────────────────────────
 * Horizontal tabs anchored under the header. Active tab gets a 2px coral
 * underline; inactive tabs are muted. Scrollable on small screens.
 */
function ConvictionTabs({ routes }: { routes: NavItem[] }) {
  const here = usePathname();
  return (
    <nav aria-label="sections" className="-mb-px flex items-center gap-0 overflow-x-auto">
      {routes.map(({ href, label }) => {
        const on = here === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={on ? "page" : undefined}
            className="nav-link shrink-0 px-4 py-2 text-[11px] uppercase tracking-[0.06em] no-underline"
            style={{
              color: on ? "var(--accent)" : "var(--text-muted)",
              fontWeight: on ? 600 : 400,
              borderBottom: on ? "2px solid var(--accent)" : "2px solid transparent",
            }}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

/* ── Shell ────────────────────────────────────────────────────────────────
 * The Lean app frame. All routes render inside this shell.
 *
 * Key constraints:
 *  - 920px max-width (bars need horizontal room)
 *  - display font (Unbounded) for headings only
 *  - 100dvh to avoid iOS Safari address-bar clipping
 *  - Fulcrum diamond (◆) instead of accent square in brand
 */

interface ShellProps {
  /** Route tab items for the secondary nav strip */
  tabs?: NavItem[];
  /** Page h1, rendered in Unbounded above children */
  pageTitle?: string;
  title?: string;
  /** Paragraph below pageTitle */
  pageSubtitle?: string;
  description?: string;
  children: React.ReactNode;
}

export default function PageShell({
  tabs = [],
  pageTitle,
  title,
  pageSubtitle,
  description,
  children,
}: ShellProps) {
  const heading = pageTitle ?? title;
  const sub = pageSubtitle ?? description;
  const eco = footerLinks();

  return (
    <div
      className="flex flex-col overflow-x-hidden"
      style={{ minHeight: "100dvh", background: "var(--bg-base)" }}
    >
      {/* ─── Top rail ───────────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-30 shrink-0"
        style={{ borderBottom: "1px solid var(--border-default)", background: "var(--bg-surface)" }}
      >
        <div className="mx-auto w-full max-w-[920px] px-4 md:px-6">
          <div className="flex items-center gap-3 py-2.5">
            <Link href="/" className="flex shrink-0 items-center gap-2 no-underline">
              <Diamond px={9} />
              <span
                className="text-[13px] font-bold uppercase tracking-[0.04em]"
                style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}
              >
                {app.name}
              </span>
            </Link>
            <span className="flex-1" />
            <NetworkBadge />
            <div className="w-[150px] shrink-0 md:w-[180px]">
              <ConnectButton />
            </div>
          </div>
          {tabs.length > 0 && <ConvictionTabs routes={tabs} />}
        </div>
      </header>

      {/* ─── Page heading (optional) ────────────────────────────────────── */}
      {(heading || sub) && (
        <div className="mx-auto w-full max-w-[920px] px-4 pt-6 md:px-6">
          {heading && (
            <h1
              className="text-[20px] font-semibold leading-tight tracking-[-0.02em] md:text-[26px]"
              style={{ fontFamily: "var(--font-display)", color: "var(--text-primary)" }}
            >
              {heading}
            </h1>
          )}
          {sub && (
            <p className="mt-1 text-[13px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              {sub}
            </p>
          )}
        </div>
      )}

      {/* ─── Content ────────────────────────────────────────────────────── */}
      <main className="mx-auto w-full max-w-[920px] flex-1 px-4 py-6 md:px-6 md:py-8">
        {children}
      </main>

      {/* ─── Ecosystem strip ────────────────────────────────────────────── */}
      <footer
        className="mx-auto w-full max-w-[920px] shrink-0 px-4 py-5 md:px-6"
        style={{ borderTop: "1px solid var(--border-subtle)" }}
      >
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <span className="inline-flex items-center gap-2">
            <Diamond px={6} />
            <BuiltOnBotChain
              className="text-[11px] uppercase tracking-[0.06em]"
              style={{ color: "var(--text-secondary)" }}
            />
          </span>
          <a href={eco.site} target="_blank" rel="noreferrer"
            className="text-[11px] underline" style={{ color: "var(--text-tertiary)" }}>
            botchain.ai
          </a>
          <a href={eco.explorer} target="_blank" rel="noreferrer"
            className="text-[11px] underline" style={{ color: "var(--text-tertiary)" }}>
            BOT Chain Explorer
          </a>
        </div>
      </footer>
    </div>
  );
}
