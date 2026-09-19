import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Confidence } from "@/components/ui";
import { ThemeToggle } from "@/components/theme-toggle";
import { GoogleSignIn } from "@/components/google-sign-in";

const EXAMPLE_FIELDS = ["Shipper", "Consignee", "Port of loading", "Port of discharge"];

const PROBLEMS = [
  {
    title: "Finding the right emails takes time",
    body: "Staff read every message to decide what it needs. A document request that is overlooked never reaches the checking step.",
  },
  {
    title: "Manual comparison is repetitive",
    body: "Names, ports, quantities and weight must be checked across two documents, and a single missed difference costs a correction.",
  },
  {
    title: "The same information looks different",
    body: "One document says Port of Loading, the other says Load Port. The system has to see they are the same field.",
  },
];

const STEPS = [
  { title: "Classify", body: "Sorts each email into a document-comparison request, a new SI request, an invoice query, a general message or spam." },
  { title: "Extract", body: "Reads the SI and BL attachments and finds the seven shipment fields, whatever each document calls them." },
  { title: "Compare", body: "Shows SI and BL values side by side and flags only the fields that differ, for example SI: 3 / BL: 4." },
  { title: "Ask for help", body: "Sends unreadable or uncertain cases to a person with the source evidence, the reason and the confidence score." },
];

const ICON = { size: 14, strokeWidth: 1.75, "aria-hidden": true } as const;

function MatchRow({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-between border-t border-border px-4 py-3">
      <span>{label}</span>
      <span className="inline-flex items-center gap-1.5 text-status-match">
        <CheckCircle2 {...ICON} />
        <span className="lbl" style={{ color: "var(--status-match)" }}>Match</span>
      </span>
    </div>
  );
}

export default async function Home({ searchParams }: PageProps<"/">) {
  const { error } = await searchParams;

  return (
    <div className="flex-1">
      <div className="hero">
        <header className="flex items-center justify-between px-6 py-6 md:px-20">
          <div className="brand p-0">
            <i />
            <span>Averis x Monash</span>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <GoogleSignIn className="btn ghost sm">Sign in with Google</GoogleSignIn>
          </div>
        </header>
        <section className="grid items-center gap-16 px-6 pt-14 pb-24 md:px-20 lg:grid-cols-2">
          <div className="flex flex-col gap-6">
            <span className="badge self-start" style={{ background: "var(--brand-active)", color: "var(--accent)" }}>
              Shipping document verification
            </span>
            <h1 className="text-[40px] leading-[46px] font-semibold tracking-[-0.03em] text-on-brand md:text-[56px] md:leading-[60px]">
              Catch mismatched shipping details{" "}
              <span className="text-accent">before the draft is final.</span>
            </h1>
            <p className="lead">
              Your inbox mixes document checks, new instructions, invoice questions and spam. Averis x Monash finds the
              document requests, compares the Shipping Instruction with the draft Bill of Lading field by field, and
              hands anything uncertain to a person.
            </p>
            <div className="flex flex-col gap-3 self-start">
              <GoogleSignIn className="btn accent lg">Continue with Google</GoogleSignIn>
              <span className="cap">Signing in with Google also connects the inbox to check.</span>
              {error && (
                <span role="alert" className="text-[13px]" style={{ color: "var(--accent)" }}>
                  Sign-in did not complete. Please try again.
                </span>
              )}
            </div>
          </div>

          <div className="card overflow-hidden p-0" aria-label="Example comparison report">
            <div className="flex items-center justify-between gap-4 px-4 py-5">
              <div>
                <div className="lbl">Comparison report</div>
                <div className="title text-base leading-6">Draft BL check for booking request</div>
              </div>
              <span className="badge bad"><AlertTriangle {...ICON} /> Mismatch found</span>
            </div>
            <div className="lbl flex justify-between bg-surface-inset px-4 py-2">
              <span>7 fields checked · 1 differs</span>
              <Confidence score={93} />
            </div>
            {EXAMPLE_FIELDS.slice(0, 2).map((f) => <MatchRow key={f} label={f} />)}
            {EXAMPLE_FIELDS.slice(2).map((f) => <MatchRow key={f} label={f} />)}
            <div className="flex items-center justify-between border-t border-border px-4 py-3" style={{ background: "var(--status-mismatch-soft)" }}>
              <span>Container count</span>
              <span className="badge bad"><AlertTriangle {...ICON} /> SI: 3 / BL: 4</span>
            </div>
            <MatchRow label="Gross weight (kg)" />
          </div>
        </section>
      </div>

      <section className="flex flex-col gap-8 px-6 py-[72px] md:px-20">
        <div className="flex max-w-[640px] flex-col gap-2">
          <div className="eyebrow">The problem</div>
          <h2 className="h2">What slows shipping teams down</h2>
          <p className="p">A missed discrepancy leads to corrections, delays and extra work. Three things make it easy to miss.</p>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {PROBLEMS.map((p, i) => (
            <div className="card flex flex-col gap-3 p-6" key={p.title}>
              <div className="flex items-center gap-2 text-[13px] font-semibold text-accent-text">
                <span className="dot" />Problem {i + 1}
              </div>
              <h3 className="title text-lg leading-[26px]">{p.title}</h3>
              <p className="p">{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4 bg-surface-inset px-6 pt-[72px] pb-14 md:px-20">
        <div className="flex max-w-[640px] flex-col gap-2">
          <div className="eyebrow">How it works</div>
          <h2 className="h2">From inbox to discrepancy report</h2>
          <p className="p">Each result comes with a confidence score, and a person steps in whenever the system cannot decide.</p>
        </div>
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <div className="flex flex-col gap-3 py-6" key={s.title}>
              <div
                className="flex size-12 items-center justify-center rounded-full text-lg font-semibold text-accent-text"
                style={{ background: "var(--accent-soft)" }}
              >
                {i + 1}
              </div>
              <h3 className="title text-lg leading-[26px]">{s.title}</h3>
              <p className="p">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="hero mx-6 mt-[72px] mb-12 flex flex-col items-start justify-between gap-6 rounded-lg p-10 md:mx-20 md:flex-row md:items-center">
        <div>
          <h2 className="h2 text-on-brand">Check your first batch</h2>
          <p className="lead text-base">Sign in with Google to connect the inbox and see the results.</p>
        </div>
        <GoogleSignIn className="btn accent lg">Continue with Google</GoogleSignIn>
      </section>
    </div>
  );
}
