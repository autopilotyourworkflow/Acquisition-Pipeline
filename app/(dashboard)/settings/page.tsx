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
    title: "Integrations",
    desc: "Connect to Google (Calendar, Gmail) and configure paid-service API keys (Apify, Proxycurl).",
    ready: true,
  },
  {
    href: "/settings/email-composer",
    title: "Email composer",
    desc: "Your signature + From name applied to every cold-outreach email you send from this account.",
    ready: true,
  },
  {
    href: "/settings/capture",
    title: "Capture",
    desc: "One-click bookmarklet for grabbing candidates from LinkedIn / JobsDB / any logged-in browser tab.",
    ready: true,
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
        <h1 className="font-display text-3xl font-medium text-black">Settings</h1>
        <p className="mt-1 text-sm text-black">
          Configure how the system behaves on your behalf.
        </p>
      </div>

      <ul className="space-y-2">
        {SECTIONS.map((s) => (
          <li key={s.href}>
            {s.ready ? (
              <Link
                href={s.href}
                className="block rounded-md border border-soft-gray bg-white px-4 py-3 transition-colors hover:bg-white"
              >
                <p className="font-medium text-black">{s.title}</p>
                <p className="mt-1 text-xs text-black">{s.desc}</p>
              </Link>
            ) : (
              <div className="block rounded-md border border-dashed border-soft-gray bg-white/30 px-4 py-3 opacity-60">
                <p className="font-medium text-black">{s.title}</p>
                <p className="mt-1 text-xs text-black">{s.desc}</p>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
