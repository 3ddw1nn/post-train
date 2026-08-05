// Markdown twin of /growth-playbook, from the same content module the page
// renders. Mirrors /docs/api.md.
import { playbookToMarkdown } from "@/lib/docs/growth-playbook";

export async function GET() {
  return new Response(playbookToMarkdown(), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
