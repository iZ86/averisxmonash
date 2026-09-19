import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, CheckCircle2, File, Flag, XCircle } from "lucide-react";
import { CategoryChip, Confidence, ConfidenceStat, PageHeader, ResultBadge, SampleBadge } from "@/components/ui";
import { AUTO_ACCEPT_THRESHOLD, confidenceLevel } from "@/lib/confidence";
import { FIELD_LABEL, getEmail } from "@/lib/mock/data";
import type { EmailResult, FieldComparison } from "@/lib/types";
import { ReclassifyPanel, ReportActions } from "./actions";

export async function generateMetadata(props: PageProps<"/emails/[emailId]">): Promise<Metadata> {
  const { emailId } = await props.params;
  const email = getEmail(emailId);
  return { title: `${email?.subject ?? "Email"} · Averis x Monash` };
}

const ICON = { size: 14, strokeWidth: 1.75, "aria-hidden": true } as const;

function fmt(v: string | number | null) {
  if (v === null) return "Missing";
  return typeof v === "number" ? v.toLocaleString("en-US") : v;
}

function Breadcrumb({ subject }: { subject: string }) {
  return (
    <div className="cap">
      <Link href="/batches" className="underline">Batches</Link> / {subject}
    </div>
  );
}

function Verdict({ email, differing }: { email: EmailResult; differing: FieldComparison[] }) {
  const overall = email.confidence;
  if (email.result === "mismatch" || (email.result === "no_mismatch")) {
    const bad = email.result === "mismatch";
    const first = differing[0];
    return (
      <div
        className="card flex items-center justify-between gap-4 border-transparent px-6 py-5"
        style={{ background: bad ? "var(--status-mismatch-soft)" : "var(--status-match-soft)" }}
      >
        <div className={`flex items-center gap-3 ${bad ? "text-status-mismatch" : "text-status-match"}`}>
          {bad ? <AlertTriangle size={24} strokeWidth={1.75} aria-hidden /> : <CheckCircle2 size={24} strokeWidth={1.75} aria-hidden />}
          <div>
            <div className="title text-base">{bad ? "Mismatch found" : "No mismatch detected"}</div>
            <div className="text-text-strong">
              {bad ? (
                <>
                  {differing.length} of 7 fields differ: {differing.map((f) => FIELD_LABEL[f.field].toLowerCase()).join(", ")}
                  {differing.length === 1 && first && (
                    <>, <b>SI: {fmt(first.si)} / BL: {fmt(first.bl)}</b></>
                  )}
                </>
              ) : (
                "All 7 fields match between the Shipping Instruction and the draft BL."
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="lbl">Overall confidence</span>
          <Confidence score={overall} showLabel />
        </div>
      </div>
    );
  }
  const failed = email.result === "failed";
  return (
    <div className="card flex items-center gap-3 border-transparent px-6 py-5" style={{ background: failed ? "var(--status-mismatch-soft)" : "var(--accent-soft)" }}>
      <span className={failed ? "text-status-mismatch" : "text-status-review"}>
        {failed ? <XCircle size={24} strokeWidth={1.75} aria-hidden /> : <Flag size={24} strokeWidth={1.75} aria-hidden />}
      </span>
      <div>
        <div className="title text-base">{failed ? "Processing failed" : "Needs review"}</div>
        <div className="text-text-strong">
          {failed ? "This email could not be processed. Retry it from the batch overview." : email.reviewReason}
        </div>
      </div>
    </div>
  );
}

function Report({ email }: { email: EmailResult }) {
  const fields = email.fields ?? [];
  const differing = fields.filter((f) => !f.match);
  const flagged = email.evidence?.flagged;

  return (
    <>
      <PageHeader
        breadcrumb={<Breadcrumb subject={email.subject} />}
        eyebrow="Comparison report"
        title={email.subject}
        description={`From ${email.sender} · received ${email.receivedAt.toLowerCase()}`}
        actions={
          <>
            <SampleBadge />
            <ReportActions email={email} />
          </>
        }
      />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-4">
          <Verdict email={email} differing={differing} />
          {fields.length > 0 && (
            <>
              <div className="card overflow-x-auto">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Field</th>
                      <th>SI (reference)</th>
                      <th>Draft BL</th>
                      <th>Confidence</th>
                      <th>Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fields.map((f) => {
                      const low = f.confidence !== null && confidenceLevel(f.confidence) !== "high";
                      return (
                        <tr key={f.field} style={!f.match ? { background: "var(--status-mismatch-soft)" } : undefined}>
                          <td>
                            <div className="font-medium">{FIELD_LABEL[f.field]}</div>
                            {f.blLabel && <div className="cap">BL calls it “{f.blLabel}”</div>}
                          </td>
                          <td>{f.match ? fmt(f.si) : <b>{fmt(f.si)}</b>}</td>
                          <td>{f.match ? fmt(f.bl) : <b className="text-status-mismatch">{fmt(f.bl)}</b>}</td>
                          <td><Confidence score={f.confidence} /></td>
                          <td>
                            {f.match ? (
                              <span className="inline-flex items-center gap-1.5 text-status-match">
                                <CheckCircle2 {...ICON} />
                                <span className="lbl text-[13px]" style={{ color: "var(--status-match)" }}>Match</span>
                              </span>
                            ) : low && f.confidence !== null && f.confidence < AUTO_ACCEPT_THRESHOLD && email.result === "needs_review" ? (
                              <ResultBadge result="needs_review" />
                            ) : (
                              <ResultBadge result="mismatch" />
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="cap">
                Overall confidence is the lowest field confidence. Anything under {AUTO_ACCEPT_THRESHOLD}% is sent to the review queue.
              </p>
            </>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <div className="card flex flex-col gap-3 p-5">
            <h2 className="title">This email</h2>
            <div className="row gap-2">
              <CategoryChip category={email.category} />
              <Confidence score={email.classificationConfidence} />
            </div>
            {email.attachments && (
              <div className="flex flex-wrap gap-2">
                {email.attachments.map((a) => (
                  <span className="chip" key={a}><File {...ICON} /> {a}</span>
                ))}
              </div>
            )}
            <p className="cap">
              Classified with {email.classificationConfidence}% confidence as a document-comparison request
              {fields.length > 0 ? ", so both attachments were read and compared." : "."}
            </p>
          </div>

          {email.evidence && (
            <div className="card overflow-hidden">
              <div className="px-5 py-4">
                <h2 className="title">Source evidence</h2>
                <p className="cap">Where the flagged values were read.</p>
              </div>
              <div className="lbl bg-surface-inset px-5 py-3">Shipping Instruction</div>
              <div className="mono px-5 py-3">
                {email.evidence.si.map((l) => <div key={l}>{l}</div>)}
              </div>
              <div className="lbl bg-surface-inset px-5 py-3">Draft Bill of Lading</div>
              <div className="mono px-5 py-3">
                {email.evidence.bl.map((l, i) => (
                  <div key={l}>
                    {i === 0 && flagged ? (
                      <span className="rounded-sm px-1" style={{ background: "var(--status-mismatch-soft)" }}>{l}</span>
                    ) : (
                      l
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function Detail({ email }: { email: EmailResult }) {
  return (
    <>
      <PageHeader
        breadcrumb={<Breadcrumb subject={email.subject} />}
        eyebrow="Email"
        title={email.subject}
        description={`From ${email.sender} · received ${email.receivedAt.toLowerCase()}`}
        actions={<SampleBadge />}
      />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="card flex flex-col gap-4 p-6">
          <h2 className="title">Message</h2>
          <p className="max-w-[620px]">{email.body}</p>
        </div>
        <div className="flex flex-col gap-4">
          <ConfidenceStat label="Classification confidence" score={email.classificationConfidence} />
          <div className="card flex flex-col gap-3 p-5">
            <h2 className="title">Classification</h2>
            <div className="row gap-2">
              <CategoryChip category={email.category} />
              <ResultBadge result="not_compared" />
            </div>
            <p className="p">
              This is {email.category === "spam" ? "spam" : email.category === "invoice_query" ? "an invoice question" : email.category === "new_si_request" ? "a new shipping instruction request" : "a general message"}, not a document-comparison request, so it did not continue to the checking step.
            </p>
            <div className="divider" />
            <p className="cap">Think this is wrong? Change the category and it will be sent to checking if it is a document request.</p>
            <ReclassifyPanel current={email.category} emailId={email.emailId} />
          </div>
        </div>
      </div>
    </>
  );
}

export default async function EmailPage(props: PageProps<"/emails/[emailId]">) {
  const { emailId } = await props.params;
  const email = getEmail(emailId);
  if (!email) notFound();
  return email.category === "document_comparison" ? <Report email={email} /> : <Detail email={email} />;
}
