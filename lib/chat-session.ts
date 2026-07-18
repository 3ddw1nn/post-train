import { cookies } from "next/headers";
import { getSessionUser } from "./auth";

const ANON_COOKIE = "pt_chat_anon";
const ANON_COOKIE_DAYS = 180;

/** Resolves the support-chat session key: "user:<id>" when signed in, otherwise
 *  a persistent "anon:<uuid>" backed by an httpOnly cookie for marketing-site visitors. */
export async function resolveChatSessionKey(): Promise<{ sessionKey: string; anonymous: boolean }> {
  const user = await getSessionUser();
  if (user) return { sessionKey: `user:${user.id}`, anonymous: false };

  const jar = await cookies();
  let anonId = jar.get(ANON_COOKIE)?.value;
  if (!anonId) {
    anonId = crypto.randomUUID();
    jar.set(ANON_COOKIE, anonId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: ANON_COOKIE_DAYS * 86400,
    });
  }
  return { sessionKey: `anon:${anonId}`, anonymous: true };
}
