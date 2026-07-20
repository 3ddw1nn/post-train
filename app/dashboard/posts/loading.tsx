import { CardListSkeleton, PageHeaderSkeleton } from "@/components/skeleton";

export default function PostsLoading() {
  return (
    <div className="fade-up">
      <PageHeaderSkeleton actions={1} />
      <div className="mt-5">
        <CardListSkeleton rows={6} />
      </div>
    </div>
  );
}
