import Link from "next/link";

export const metadata = { title: "Settings · Acquisition" };

const SECTIONS = [
  {
    href: "/settings/prompts",
    title: "Scoring prompt",
    desc: "Edit the persona that drives the resume screener. Saving creates a new version; old scores keep their original version label for traceability.",
    ready: true,
  },
  {
    href: "/settings/integrations",
    title: "Integrations (Day 3)",
    desc: "Connect your Google account for Calendar FreeBusy and Gmail draft creation. Granular per-scope consent.",
    ready: false,
  },
  {
    href: "/settings/team",
    title: "Team (Day 4)",
    desc: "Invite teammates, manage roles (Owner / Member), and revoke access.",
    ready: false,
  },
];

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-medium text-navy">Settings</h1>
        <p className="mt-1 text-sm text-charcoal">
          Configure how the system behaves on your behalf.
        </p>
      </div>

      <ul className="space-y-2">
        {SECTIONS.map((s) => (
          <li key={s.href}>
            {s.ready ? (
              <Link
                href={s.href}
                className="block rounded-md border border-sand-200 bg-warm-white px-4 py-3 transition-colors hover:bg-cream"
              >
                <p className="font-medium text-navy">{s.title}</p>
                <p className="mt-1 text-xs text-charcoal">{s.desc}</p>
              </Link>
            ) : (
              <div className="block rounded-md border border-dashed border-sand-200 bg-cream/30 px-4 py-3 opacity-60">
                <p className="font-medium text-navy">{s.title}</p>
                <p className="mt-1 text-xs text-charcoal">{s.desc}</p>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
