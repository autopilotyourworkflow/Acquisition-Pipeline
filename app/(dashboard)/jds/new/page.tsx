import { JdEditor } from "../jd-editor.client";

export const metadata = { title: "New JD · Acquisition" };

export default function NewJdPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-medium text-navy">New job description</h1>
        <p className="mt-1 text-sm text-charcoal">
          The must-haves and threshold feed directly into the AI scoring prompt.
        </p>
      </div>
      <JdEditor mode="create" />
    </div>
  );
}
