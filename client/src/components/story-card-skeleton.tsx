import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function StoryCardSkeleton() {
  return (
    <Card className="flex flex-col gap-3 p-4" data-testid="skeleton-story-card">
      <div className="flex items-center gap-1.5">
        <Skeleton className="h-5 w-20 rounded-full" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <Skeleton className="h-5 w-full" />
      <Skeleton className="h-5 w-4/5" />
      <div className="flex items-center gap-3 pt-1">
        <Skeleton className="h-7 w-16 rounded-md" />
        <Skeleton className="h-5 w-12" />
        <Skeleton className="h-5 w-14" />
      </div>
    </Card>
  );
}
