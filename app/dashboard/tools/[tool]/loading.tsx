import { SkeletonBlock } from "@/components/skeleton";

export default function DashboardToolLoading() {
  return (
    <div className="fade-up">
      <SkeletonBlock className="h-4 w-28" />
      <div className="mt-4">
        <SkeletonBlock className="h-8 w-64" />
        <SkeletonBlock className="mt-2 h-4 w-96 max-w-full" />
      </div>
      <div className="card mt-5 max-w-2xl p-6">
        <SkeletonBlock className="h-10 w-full" />
        <SkeletonBlock className="mt-4 h-32 w-full" />
      </div>
    </div>
  );
}
