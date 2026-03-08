import type { VideoInfo } from "@/types";
import {
  isBilibiliUrl,
  getBilibiliVideoInfo,
  bilibiliInfoToVideoInfo,
} from "@/lib/bilibili-adapter";

export async function scanBilibiliVideos(
  pageUrl: string,
): Promise<VideoInfo[]> {
  if (!isBilibiliUrl(pageUrl)) return [];

  try {
    const info = await getBilibiliVideoInfo(pageUrl);
    const video = bilibiliInfoToVideoInfo(info);
    return [video];
  } catch (err) {
    console.warn("[VDExtension] Bilibili scan failed:", err);
    return [];
  }
}
