// Plain-text Markdown twin of /docs/api, rendered from the same content module
// the page uses. Linked from the page's "View as Markdown" item and pointed at
// by /llms.txt, so a model can read the reference without parsing our HTML.
import { docsToMarkdown } from "@/lib/docs/api-reference";

export async function GET() {
  return new Response(docsToMarkdown(), {
    headers: {
      // text/plain, not text/markdown: browsers download the latter instead of
      // rendering it, which defeats the point of a "view as" link.
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
