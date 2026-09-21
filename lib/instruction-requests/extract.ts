import "server-only";
import { OpenRouter } from "@openrouter/sdk";
import { z } from "zod";
import { openRouterConfig } from "@/config/server-env";
import { SI_FIELDS, type SiValues } from "./bl-text";

const openRouter = new OpenRouter({ apiKey: openRouterConfig.apiKey });

const TOOL_NAME = "record_shipping_instruction";

const SYSTEM_PROMPT = `You read an email that submits a Shipping Instruction (SI) and record the SI's 7 values. The email is given as JSON with its sender, subject, body and attachments (each with its extracted text). Always answer by calling the ${TOOL_NAME} tool.

Fields: shipper, consignee, notify_party, port_of_loading, port_of_discharge, container_count, gross_weight_kg.

The documents label the same field differently: Shipper / Exporter / Consignor / Shipper (Principal or Seller); Consignee / Cnee / "To Order of"; Notify / Notify Party; POL / Load Port / Port of Loading (not Place of Receipt); POD / Discharge Port / Port of Discharge (not Place of Delivery); No. of Containers / Total Containers (not a package count); Gross Weight / G.W. / Gross Wt (kgs) (not net weight or VGM).

Rules:
- Read only the Shipping Instruction, identified by its content. Never borrow values from a draft Bill of Lading, an invoice or the email body.
- Copy each value as printed, trimmed to a single line. Do not normalise it, add location codes or convert units.
- For a party with an address, write the name first, then "; " and the address. Where the document breaks the address across lines, join the lines with "; ".
- Use an empty string for a field the SI has no value for ("N/A", a blank, or a label with nothing after it). Never guess.`;

const valueSchema = z.object(Object.fromEntries(SI_FIELDS.map((f) => [f, z.string().nullish()])) as Record<(typeof SI_FIELDS)[number], z.ZodOptional<z.ZodNullable<z.ZodString>>>);

const parameters = {
  type: "object",
  properties: Object.fromEntries(SI_FIELDS.map((f) => [f, { type: "string", description: `The SI's ${f.replace(/_/g, " ")}, or "" if absent.` }])),
  required: [...SI_FIELDS],
  additionalProperties: false,
};

export type SiExtractionInput = {
  from: string;
  subject: string;
  body: string;
  attachments: { attachment_name: string; attachment_content: string | null }[];
};

/** Reads the 7 Shipping Instruction values from an SI-request email. Throws when the model gives no usable answer. */
export async function extractSiValues(input: SiExtractionInput): Promise<SiValues> {
  const result = await openRouter.chat.send({
    chatRequest: {
      model: openRouterConfig.model,
      temperature: 0,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: JSON.stringify(input, null, 2) },
      ],
      tools: [{ type: "function", function: { name: TOOL_NAME, description: "Record the 7 values of the Shipping Instruction.", parameters } }],
      toolChoice: { type: "function", function: { name: TOOL_NAME } },
      provider: { requireParameters: true },
    },
  });
  if (!("choices" in result)) throw new Error("Unexpected streaming response.");
  const call = result.choices[0]?.message.toolCalls?.find((c) => c.function.name === TOOL_NAME);
  if (!call) throw new Error("The model did not return the shipping instruction.");

  const parsed = valueSchema.safeParse(JSON.parse(call.function.arguments));
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
  return Object.fromEntries(SI_FIELDS.map((f) => [f, parsed.data[f]?.trim() ?? ""])) as SiValues;
}

/** True when SI_REQUEST is the winning category (a comparison wins a tie, matching the dashboard). */
export function isSiRequest(categories: { category: string; confidence_score: number }[]): boolean {
  const scored = categories.filter((c) => c.confidence_score > 0);
  if (scored.length === 0) return false;
  const max = Math.max(...scored.map((c) => c.confidence_score));
  if (scored.some((c) => c.category === "BL_COMPARISON" && c.confidence_score >= max)) return false;
  return scored.find((c) => c.confidence_score === max)?.category === "SI_REQUEST";
}
