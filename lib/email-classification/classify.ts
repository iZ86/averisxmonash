import "server-only";
import { OpenRouter } from "@openrouter/sdk";
import { openRouterConfig } from "@/config/server-env";
import { SYSTEM_PROMPT, TOOL_DESCRIPTION, TOOL_NAME } from "./prompt";
import {
  COMPARED_FIELDS,
  classificationJsonSchema,
  classificationSchema,
  findActiveBl,
  findActiveSiRequest,
  type Classification,
  type ClassificationResponse,
  type ClassifierInput,
  type ExtractedDocumentValues,
} from "./schemas";

// Retries when the model returns a missing or invalid tool call.
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1_500;

const openRouter = new OpenRouter({ apiKey: openRouterConfig.apiKey });

export class ClassificationError extends Error {
  constructor(
    message: string,
    readonly attempts: string[],
  ) {
    super(message);
    this.name = "ClassificationError";
  }
}

export async function classifyEmail(email: ClassifierInput): Promise<ClassificationResponse> {
  const failures: string[] = [];

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (attempt > 1) await sleep(RETRY_DELAY_MS * (attempt - 1));
    const outcome = await requestClassification(email);
    if (outcome.ok) return toResponse(email.email_id, outcome.classification);
    failures.push(`attempt ${attempt}: ${outcome.error}`);
  }

  throw new ClassificationError("The model did not return a valid classification", failures);
}

type Outcome = { ok: true; classification: Classification } | { ok: false; error: string };

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestClassification(email: ClassifierInput): Promise<Outcome> {
  // Request failures are not retried here: the SDK already retries 429/5xx and
  // connection errors, and anything it still throws (e.g. OpenRouter answering
  // 200 with a provider error in the body) fails the email. Only an unusable
  // answer from the model is retried, by the loop above.
  return readToolCall(await sendRequest(email));
}

async function sendRequest(email: ClassifierInput) {
  return openRouter.chat.send({
    chatRequest: {
      model: openRouterConfig.model,
      temperature: 0,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: JSON.stringify(email, null, 2) },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: TOOL_NAME,
            description: TOOL_DESCRIPTION,
            parameters: classificationJsonSchema,
          },
        },
      ],
      toolChoice: { type: "function", function: { name: TOOL_NAME } },
      // Only route to providers that support tools + a forced tool_choice.
      provider: { requireParameters: true },
    },
  }, {
    // Rate limits and provider overloads are common when running many emails in
    // parallel, so back off and retry them instead of failing the email.
    retries: {
      strategy: "backoff",
      backoff: { initialInterval: 2_000, maxInterval: 30_000, exponent: 2, maxElapsedTime: 120_000 },
      retryConnectionErrors: true,
    },
    retryCodes: ["429", "5XX"],
  });
}

function readToolCall(result: Awaited<ReturnType<typeof sendRequest>>): Outcome {
  if (!("choices" in result)) return { ok: false, error: "unexpected streaming response" };

  const toolCall = result.choices[0]?.message.toolCalls?.find(
    (call) => call.function.name === TOOL_NAME,
  );
  if (!toolCall) return { ok: false, error: `no ${TOOL_NAME} tool call in the response` };

  let args: unknown;
  try {
    args = JSON.parse(toolCall.function.arguments);
  } catch {
    return { ok: false, error: "tool call arguments are not valid JSON" };
  }

  const parsed = classificationSchema.safeParse(stripNulls(args));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
  }
  return { ok: true, classification: parsed.data };
}

// Models often send `null` for optional fields they don't use; treat that as absent.
function stripNulls(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripNulls);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== null)
        .map(([k, v]) => [k, stripNulls(v)]),
    );
  }
  return value;
}

function toDocumentValues(
  isActive: boolean,
  values: Classification["shipping_instruction"],
): ExtractedDocumentValues | null {
  if (!isActive || !values) return null;
  return Object.fromEntries(
    // `stripNulls` has already turned every null the model sent into an absent
    // key, so read each field back through a default rather than trusting it
    // to be present.
    COMPARED_FIELDS.map((field) => [field, blankToNull(values[field])]),
  ) as ExtractedDocumentValues;
}

// A label the model echoed with nothing after it shouldn't reach the DB as "".
function blankToNull(value: string | null | undefined): string | null {
  return value?.trim() || null;
}

function toResponse(emailId: string, classification: Classification): ClassificationResponse {
  const categories = classification.categories
    .filter((c) => c.confidence_score > 0)
    .map(({ category, confidence_score }) => ({ category, confidence_score }));
  if (categories.length === 0) categories.push({ category: "GENERAL", confidence_score: 1 });

  const response: ClassificationResponse = {
    email_id: emailId,
    reasoning: classification.reasoning,
    categories,
    status: "OK",
    review_reason: null,
    defect_fields: [],
    has_defect: false,
    shipping_instruction: null,
    bill_of_lading: null,
    shipping_instruction_request: null,
  };

  const bl = findActiveBl(classification.categories);

  // Both documents' values exist only for a BL comparison, the same way the
  // four comparison fields above carry their defaults otherwise (rules.md
  // invariant 7). A model that fills them in on a GENERAL or SI_REQUEST email is
  // corrected here rather than in the schema: a parse issue would burn one of
  // the three attempts and can fail the email outright.
  response.shipping_instruction = toDocumentValues(Boolean(bl), classification.shipping_instruction);
  response.bill_of_lading = toDocumentValues(Boolean(bl), classification.bill_of_lading);

  // The SI an SI_REQUEST email supplies, read from its attachment or its body.
  // Gated the same way, on its own category: `findActiveSiRequest` gives
  // BL_COMPARISON the tie, so this and the two objects above are never both
  // filled in for one email.
  response.shipping_instruction_request = toDocumentValues(
    Boolean(findActiveSiRequest(classification.categories)),
    classification.shipping_instruction_request,
  );

  if (bl?.status === "MISMATCH" || bl?.status === "OK") {
    const defects = new Set(bl.defect_fields ?? []);

    // Weights are compared here rather than by the model: 20,603 vs 22,603 and
    // 214,270 vs 214,770 read as equal to a model, but not to ===.
    if (typeof bl.si_gross_weight_kg === "number" && typeof bl.bl_gross_weight_kg === "number") {
      if (bl.si_gross_weight_kg === bl.bl_gross_weight_kg) defects.delete("gross_weight_kg");
      else defects.add("gross_weight_kg");
    }

    if (defects.size > 0) {
      response.status = "MISMATCH";
      // Alphabetical, matching the expected output format (rules.md).
      response.defect_fields = [...defects].sort();
      response.has_defect = true;
    }
  } else if (bl?.status === "NEEDS_REVIEW") {
    response.status = "NEEDS_REVIEW";
    response.review_reason = bl.review_reason ?? null;
  }

  return response;
}
