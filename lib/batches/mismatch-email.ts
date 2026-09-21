import { REVIEW_FIELD_LABEL, senderAddress, type ReviewField } from "./review-cases";

/** The email sent to a sender whose Shipping Instruction and draft BL differ. Used by the preview and the sender. */
export function mismatchEmail(input: { from: string; subject: string; fields: string[] }) {
  const name = input.from.match(/^\s*"?([^"<]+?)"?\s*</)?.[1]?.split(" ")[0];
  const differing = input.fields.map((f) => REVIEW_FIELD_LABEL[f as ReviewField] ?? f);
  const list = differing.length ? `\n\nThe following fields differ:\n${differing.map((f) => `  - ${f}`).join("\n")}` : "";
  return {
    to: senderAddress(input.from),
    subject: /^re:/i.test(input.subject) ? input.subject : `Re: ${input.subject}`,
    body:
      `Hi${name ? ` ${name}` : ""},\n\n` +
      "We have completed the review of your recently submitted shipping documents.\n\n" +
      "Our document comparison has found a discrepancy between your Shipping Instruction and the draft Bill of Lading." +
      `${list}\n\n` +
      "Please review the documents and reply with a corrected draft Bill of Lading, or confirm the instructions so we can proceed.\n\n" +
      "Thank you,\nAPRIL Group",
  };
}
