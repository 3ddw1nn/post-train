import { CardListSkeleton, SkeletonBlock } from "@/components/skeleton";

export default function PostsLoading() {
  return (
    <div className="fade-up">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <SkeletonBlock className="h-8 w-40" />
        <SkeletonBlock className="h-4 w-64 max-w-full" />
      </div>
      <div className="mt-5">
        <CardListSkeleton rows={6} />
      </div>
    </div>
  );
}
