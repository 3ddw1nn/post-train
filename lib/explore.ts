// Explore ("viral content library") data access — thin wrappers over the
// convex/explore.ts queries, following the same shape as lib/studio.ts.
import { api } from "@/convex/_generated/api";
import { convexQuery } from "./db";

export type ExploreItem = {
  id: string;
  platform: string;
  category: string;
  media_type: "video" | "slideshow";
  cover_image_url: string;
  slide_count: number;
  caption: string;
  hashtags: string[];
  creator_handle: string;
  creator_avatar_url: string | null;
  source_url: string;
  view_count: number;
  like_count: number;
  comment_count: number;
  share_count: number;
  save_count: number;
  is_monetized: number;
  posted_at: string;
  created_at: string;
};

export type ExploreSlide = {
  explore_item_id: string;
  sort_order: number;
  image_url: string;
  text: string;
};

export async function listExploreItems(): Promise<ExploreItem[]> {
  return await convexQuery<ExploreItem[]>(api.explore.listPublished, {});
}

export async function getExploreItem(id: string): Promise<ExploreItem | null> {
  return await convexQuery<ExploreItem | null>(api.explore.getById, { id });
}

export async function listExploreSlides(exploreItemId: string): Promise<ExploreSlide[]> {
  return await convexQuery<ExploreSlide[]>(api.explore.listSlides, {
    explore_item_id: exploreItemId,
  });
}
