import { refreshTumblrToken, TumblrError, type TumblrCredentials } from "./tumblr";

export async function publishToTumblr(creds: TumblrCredentials, blogName: string, text: string) {
  const fresh = creds.expires_at <= Date.now() + 60_000 ? await refreshTumblrToken(creds) : creds;
  const res = await fetch(`https://api.tumblr.com/v2/blog/${encodeURIComponent(blogName)}.tumblr.com/posts`, { method: "POST", headers: { Authorization: `Bearer ${fresh.access_token}`, "Content-Type": "application/json", "User-Agent": "Post Train/1.0 (+https://posttrain.app)" }, body: JSON.stringify({ content: [{ type: "text", text }] }) });
  if (res.status === 401) throw new TumblrError("Tumblr access expired — reconnect this account.", "auth_expired");
  if (!res.ok) throw new TumblrError(`Tumblr post failed: ${await res.text()}`, "platform_error");
  const json = await res.json() as { response?: { id?: string | number; post_url?: string } };
  const id = json.response?.id;
  if (!id) throw new TumblrError("Tumblr did not return a post id.", "platform_error");
  return { result: { platform_post_id: String(id), share_url: json.response?.post_url ?? `https://${blogName}.tumblr.com/post/${id}/` }, refreshedCreds: fresh.access_token !== creds.access_token ? fresh : null };
}
