import "server-only";
import { OpenRouter } from "@openrouter/sdk";
import { openRouterConfig } from "@/config/server-env";
import { SYSTEM_PROMPT, TOOL_DESCRIPTION, TOOL_NAME } from "./prompt";
import {
  classificationJsonSchema,
  classificationSchema,
  findActiveBl,
  type Classification,
  type ClassificationResponse,
  type ClassifierInput,
} from "./schemas";

// One retry when the model returns a missing or invalid tool call.
const MAX_ATTEMPTS = 2;

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
    const outcome = await requestClassification(email);
    if (outcome.ok) return toResponse(email.email_id, outcome.classification);
    failures.push(`attempt ${attempt}: ${outcome.error}`);
  }

  throw new ClassificationError("The model did not return a valid classification", failures);
}

type Outcome = { ok: true; classification: Classification } | { ok: false; error: string };

async function requestClassification(email: ClassifierInput): Promise<Outcome> {
  const result = await openRouter.chat.send({
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
  };

  const bl = findActiveBl(classification.categories);
  if (bl?.status === "MISMATCH") {
    response.status = "MISMATCH";
    response.defect_fields = [...new Set(bl.defect_fields)];
    response.has_defect = true;
  } else if (bl?.status === "NEEDS_REVIEW") {
    response.status = "NEEDS_REVIEW";
    response.review_reason = bl.review_reason ?? null;
  }

  return response;
}
