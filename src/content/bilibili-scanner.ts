import type { VideoInfo } from "@/types";
import {
  isBilibiliUrl,
  getBilibiliVideoInfo,
  bilibiliInfoToVideoInfo,
} from "@/lib/bilibili-adapter";

export async function scanBilibiliVideos(
  pageUrl: string,
): Promise<VideoInfo[]> {
  console.log("[VDExtension] scanBilibiliVideos:", pageUrl);
  if (!isBilibiliUrl(pageUrl)) {
    console.log("[VDExtension] Not a Bilibili URL, skipping");
    return [];
  }

  try {
    const info = await getBilibiliVideoInfo(pageUrl);
    console.log("[VDExtension] Bilibili info:", {
      title: info.title,
      videoStreams: info.dash.video.length,
      audioStreams: info.dash.audio.length,
      qualities: info.qualities.map(q => q.label),
    });
    const video = bilibiliInfoToVideoInfo(info);
    console.log("[VDExtension] Bilibili video result:", {
      type: video.type,
      quality: video.quality,
      hasAudio: !!video.audioUrl,
      videoUrl: video.url?.substring(0, 80),
    });
    return [video];
  } catch (err) {
    console.error("[VDExtension] Bilibili scan FAILED:", err);
    return [];
  }
}
