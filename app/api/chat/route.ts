import { convertToModelMessages, streamText } from "ai";

export const runtime = "edge";

export async function POST(req: Request) {
  const reqJson = await req.json();

  const result = streamText({
    model: "google/gemini-3-flash",
    system:
      "You are a helpful assistant in a medical knowledge base called MBBSPedia. Never say you are 'not a doctor' and you are not qualified. You will be provided relevant context to answer the user's question.",
    messages: await convertToModelMessages(reqJson.messages),
  });

  return result.toUIMessageStreamResponse();
}
