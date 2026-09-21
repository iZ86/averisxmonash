# Advanced requirements checklist

Assumes the minimum requirements are complete: classify, extract the 7 fields, compare with SI/BL values side by side, "No mismatch detected", human escalation, `submission.json` export in the `sample_submission.json` shape, and scoreboard submission.

Legend: `[x]` done in the code today, `[ ]` still to do or to verify. Tick each box as you go.

## 1. PDF and Word attachments

- [x] Extract text from `.pdf` (text layer), `.docx`, `.doc`, `.xlsx` (`lib/email-processing/extract-text.ts`).
- [ ] Tables and different page layouts. Text is flattened before it reaches the LLM, so multi-column or table layouts can scramble label/value pairs. Test against the sample PDFs and Word files; if fields are misread, extract tables in a layout-aware way, or send the page image to a vision model.

## 2. Scanned documents

- [ ] OCR or a vision-capable LLM for image-only PDFs. Today a PDF with no text layer becomes `unreadable` and goes to review, and the comparison is never attempted. **This is the biggest gap.**
- [ ] Fall back to OCR/vision only when the text layer is empty, to keep cost and latency down.
- [ ] Send low-confidence OCR results to review, with the page image as evidence.

## 3. Messier inputs

- [x] Varied field labels (POL / Load Port, Consignor / Shipper, and so on) and "not the same field" rules (Place of Receipt, package count, net weight, VGM).
- [x] Formatting differences: weight units and separators, port name vs. code, party name with or without an address.
- [x] Missing attachments, wrong document type (invoice or packing list in place of a BL), and missing values, all routed to `NEEDS_REVIEW`.
- [ ] Misleading email subjects. The prompt says intent beats attachments; verify with sample emails whose subject contradicts the body.
- [ ] Real discrepancy vs. reading or formatting issue. The LLM decides this. Consider a code-side normalisation check (numbers, port codes) as a second opinion, since weights are already compared exactly in code.
- [ ] Measure false alarms. Use scoreboard misses to tune, and record why any disagreement with the reference is reasonable, as the brief asks.

## 4. Reliability and human review

- [x] Review reasons: `missing_attachment`, `wrong_doc_type`, `unreadable`, `missing_value`.
- [x] Review queue with a reviewer UI. The reviewer can accept confirmed fields or reject and email the sender (`app/api/reviews/route.ts`).
- [x] Processing failures are shown as FAILED and can be retried (`app/api/emails/sync/retry/route.ts`).
- [ ] Source evidence in review. Confirm the review view shows the relevant attachment text or image next to each value, not only the extracted values.
- [ ] Report updates after a person confirms or corrects. Confirm that accepting a fix recomputes the mismatch report and dashboard, not just the status.
- [ ] Let the reviewer correct the BL-side values as well as the SI fields.
- [ ] Give a reason for every uncertain result. Today only the four reasons above trigger review; a low-confidence classification or extraction does not.
- [x] Failed emails must not disappear from `submission.json`. The export currently skips them, but the brief says to include every email.

## Suggested order

1. OCR / vision fallback for scanned PDFs.
2. Show source evidence in the review UI and confirm that the report updates after review.
3. Test table-heavy PDFs and Word files against the sample data.
4. Include failed emails in the export, and add confidence-based review.
5. Use the scoreboard to find classification and mismatch errors, and note the reason for any deliberate disagreement.
