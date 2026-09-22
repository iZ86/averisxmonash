import "server-only";
import { OpenRouter } from "@openrouter/sdk";
import { z } from "zod";
import { openRouterConfig } from "@/config/server-env";

const TOOL_NAME = "record_document_text";

const SYSTEM_PROMPT = `You transcribe scanned documents. Each attached PDF is labelled with its file name. For every one, return the complete text exactly as it is printed: every label and every value, in reading order, keeping line breaks. Do not summarise, translate, correct, reformat or add anything. If a document has no legible text, return an empty string for it. Always answer by calling the ${TOOL_NAME} tool, with one entry per attached file.`;

const ocrResultSchema = z.object({
  documents: z.array(
    z.object({
      file_name: z.string().describe("The file name exactly as it was given."),
      attachment_content: z.string().describe("The document's full text, transcribed as printed."),
    }),
  ),
});

const ocrJsonSchema: Record<string, unknown> = z.toJSONSchema(ocrResultSchema);
delete ocrJsonSchema.$schema;

const openRouter = new OpenRouter({ apiKey: openRouterConfig.apiKey });

export type OcrFile = { filename: string; data: Buffer };

/**
 * Transcribes image-only PDFs in a single request and returns their text keyed
 * by file name. OpenRouter parses the PDFs server-side (its default file-parser
 * engine is mistral-ocr); pinning it with
 * `plugins: [{ id: "file-parser", pdf: { engine: "mistral-ocr" } }]` is the
 * planned hardening once this is proven.
 *
 * Throws on any failure. The caller treats a throw the same as "no text": the
 * attachment keeps its no-text-layer note and is judged unreadable.
 */
export async function ocrPdfs(files: OcrFile[]): Promise<Map<string, string>> {
  const content = [
    { type: "text" as const, text: "Transcribe each of these documents." },
    ...files.flatMap((file) => [
      { type: "text" as const, text: `File name: ${file.filename}` },
      {
        type: "file" as const,
        file: { filename: file.filename, fileData: `data:application/pdf;base64,${file.data.toString("base64")}` },
      },
    ]),
  ];

  const result = await openRouter.chat.send({
    chatRequest: {
      model: openRouterConfig.model,
      temperature: 0,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: TOOL_NAME,
            description: "Record the transcribed text of each attached document.",
            parameters: ocrJsonSchema,
          },
        },
      ],
      toolChoice: { type: "function", function: { name: TOOL_NAME } },
      provider: { requireParameters: true },
    },
  }, {
    retries: {
      strategy: "backoff",
      backoff: { initialInterval: 2_000, maxInterval: 30_000, exponent: 2, maxElapsedTime: 120_000 },
      retryConnectionErrors: true,
    },
    retryCodes: ["429", "5XX"],
  });

  if (!("choices" in result)) throw new Error("unexpected streaming response");
  const toolCall = result.choices[0]?.message.toolCalls?.find((call) => call.function.name === TOOL_NAME);
  if (!toolCall) throw new Error(`no ${TOOL_NAME} tool call in the OCR response`);

  const parsed = ocrResultSchema.parse(JSON.parse(toolCall.function.arguments));
  const texts = new Map<string, string>();
  for (const doc of parsed.documents) {
    // Only accept names we actually sent, so a model that renames or invents a
    // file can't attach text to the wrong attachment.
    if (files.some((file) => file.filename === doc.file_name)) texts.set(doc.file_name, doc.attachment_content);
  }
  return texts;
}
