import Link from "next/link";
import { BLOG_POSTS } from "@/lib/blog-posts";

export const metadata = { title: "Blog" };

export default function BlogIndex() {
  return (
    <section className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-extrabold">Blog</h1>
      <p className="mt-2 text-muted">Notes on shipping content without losing your week.</p>
      <div className="mt-8 flex flex-col gap-4">
        {BLOG_POSTS.map((p) => (
          <Link key={p.slug} href={`/blog/${p.slug}`} className="card p-6 hover:border-primary">
            <p className="text-xs text-muted">{new Date(p.date).toLocaleDateString()}</p>
            <h2 className="mt-1 text-lg font-bold">{p.title}</h2>
            <p className="mt-1 text-sm text-muted">{p.excerpt}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
