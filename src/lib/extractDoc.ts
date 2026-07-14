const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_TEXT_CHARS = 20_000; // keep the LLM prompt sane

/**
 * Extract plain text from an uploaded document (PDF, .txt, .md).
 * Throws with a user-facing message on unsupported/oversized files.
 */
export async function extractDocumentText(file: File): Promise<string> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error("File too large — keep uploads under 10 MB.");
  }
  const buf = Buffer.from(await file.arrayBuffer());
  const name = file.name.toLowerCase();

  let text: string;
  if (file.type === "application/pdf" || name.endsWith(".pdf")) {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: new Uint8Array(buf) });
    try {
      text = (await parser.getText()).text;
    } finally {
      await parser.destroy();
    }
  } else if (
    file.type.startsWith("text/") ||
    /\.(txt|md|csv)$/.test(name) ||
    file.type === ""
  ) {
    text = buf.toString("utf8");
  } else {
    throw new Error(
      `Unsupported file type "${file.type || name}". Upload a PDF, .txt, or .md file.`,
    );
  }

  text = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!text) {
    throw new Error(
      "Couldn't extract any text from that file — if it's a scanned PDF, paste the syllabus as text instead.",
    );
  }
  return text.length > MAX_TEXT_CHARS
    ? text.slice(0, MAX_TEXT_CHARS) + "\n…[document truncated]"
    : text;
}
