"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { CATEGORY_LABEL } from "@/lib/mock/data";
import type { Category, EmailResult } from "@/lib/types";

export function ReportActions({ email }: { email: EmailResult }) {
  function exportResult() {
    const blob = new Blob([JSON.stringify(email, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${email.emailId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <button
        type="button"
        className="btn ghost"
        onClick={() => toast.success("Sent to review", { description: email.subject })}
      >
        Send to review
      </button>
      <button type="button" className="btn primary" onClick={exportResult}>
        Export result
      </button>
    </>
  );
}

export function ReclassifyPanel({ current, emailId }: { current: Category; emailId: string }) {
  const [value, setValue] = useState<Category>(current);
  return (
    <>
      <label className="input relative justify-between">
        <span className="sr-only">Category</span>
        <select
          value={value}
          onChange={(e) => setValue(e.target.value as Category)}
          className="w-full cursor-pointer appearance-none bg-transparent pr-6 outline-none"
        >
          {(Object.keys(CATEGORY_LABEL) as Category[]).map((c) => (
            <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
          ))}
        </select>
        <ChevronDown size={16} strokeWidth={1.75} aria-hidden className="pointer-events-none absolute right-3 text-text-subtle" />
      </label>
      <button
        type="button"
        className="btn primary"
        disabled={value === current}
        onClick={() =>
          toast.success("Reclassified", {
            description: `${emailId} → ${CATEGORY_LABEL[value]}. The pipeline will re-run once it is connected.`,
          })
        }
      >
        Reclassify
      </button>
    </>
  );
}
