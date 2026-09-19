import { classifyEmail, ClassificationError } from "@/lib/email-classification/classify";
import { emailInputSchema } from "@/lib/email-classification/schemas";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  const parsed = emailInputSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid email payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    return Response.json(await classifyEmail(parsed.data));
  } catch (error) {
    console.error("process-email failed", error);
    if (error instanceof ClassificationError) {
      return Response.json({ error: error.message, attempts: error.attempts }, { status: 502 });
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: `LLM request failed: ${message}` }, { status: 502 });
  }
}
