import { ConvexError } from "convex/values";
import { convexMutation, convexQuery } from "@/lib/db";
import { resolveChatSessionKey } from "@/lib/chat-session";
import { api } from "@/convex/_generated/api";

type SupportMessage = {
  _id: string;
  role: "user" | "assistant";
  content: string;
  status: "pending" | "complete" | "error";
  provider: string | null;
};

export async function GET() {
  const { sessionKey, anonymous } = await resolveChatSessionKey();
  const messages = await convexQuery<SupportMessage[]>(api.supportChat.listForSession, { sessionKey });
  return Response.json({ messages, needsLeadCapture: anonymous && messages.length === 0 });
}

export async function POST(req: Request) {
  const { sessionKey } = await resolveChatSessionKey();
  const body = await req.json().catch(() => null);
  const content = typeof body?.content === "string" ? body.content : "";
  try {
    await convexMutation(api.supportChat.sendMessage, { sessionKey, content });
  } catch (e) {
    const message = e instanceof ConvexError ? String(e.data) : "Couldn't send that. Try again.";
    return Response.json({ error: { message } }, { status: 400 });
  }
  return Response.json({ ok: true });
}

export async function DELETE() {
  const { sessionKey } = await resolveChatSessionKey();
  await convexMutation(api.supportChat.clearSession, { sessionKey });
  return Response.json({ ok: true });
}
