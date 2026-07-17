import Link from "next/link";
import { notFound } from "next/navigation";
import { BLOG_POSTS } from "@/lib/blog-posts";

export function generateStaticParams() {
  return BLOG_POSTS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = BLOG_POSTS.find((x) => x.slug === slug);
  return { title: p ? p.title : "Not found" };
}

export default async function BlogPost({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = BLOG_POSTS.find((x) => x.slug === slug);
  if (!post) notFound();
  return (
    <article className="mx-auto max-w-2xl px-6 py-16">
      <p className="text-xs text-muted">{new Date(post.date).toLocaleDateString()}</p>
      <h1 className="mt-1 text-3xl font-extrabold leading-tight">{post.title}</h1>
      <div className="mt-6 flex flex-col gap-4 leading-relaxed text-ink/90">
        {post.body.map((para, i) => (
          <p key={i}>{para}</p>
        ))}
      </div>
      <div className="card mt-10 bg-primary-soft p-6 text-center">
        <p className="font-bold text-primary-dark">Put this into practice</p>
        <Link href="/create-account" className="btn-primary mt-3">
          Try Post Train free
        </Link>
      </div>
    </article>
  );
}
