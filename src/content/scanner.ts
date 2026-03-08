import type { VideoInfo } from "@/types";
import { VideoType } from "@/types";

function collectVideoElements(
  root: Document | ShadowRoot = document,
): HTMLVideoElement[] {
  const videos: HTMLVideoElement[] = [];
  videos.push(...Array.from(root.querySelectorAll("video")));

  root.querySelectorAll("*").forEach((el) => {
    if (el.shadowRoot) {
      videos.push(...collectVideoElements(el.shadowRoot));
    }
  });

  return videos;
}

function getVideoType(src: string): VideoType {
  if (src.startsWith("blob:")) return VideoType.BLOB;
  if (src.includes(".m3u8")) return VideoType.HLS;
  if (src.includes(".mpd")) return VideoType.DASH;
  return VideoType.DIRECT;
}

function getVideoTitle(videoEl: HTMLVideoElement): string {
  const title =
    videoEl.getAttribute("title") ||
    videoEl.getAttribute("aria-label") ||
    videoEl.closest("[title]")?.getAttribute("title") ||
    document.title;
  return title || "video";
}

export function scanVideos(): VideoInfo[] {
  const videoElements = collectVideoElements();
  const videos: VideoInfo[] = [];
  const seenUrls = new Set<string>();

  for (const el of videoElements) {
    const sources: string[] = [];

    if (el.src) sources.push(el.src);
    if (el.currentSrc && el.currentSrc !== el.src)
      sources.push(el.currentSrc);

    el.querySelectorAll("source").forEach((source) => {
      if (source.src) sources.push(source.src);
    });

    for (const src of sources) {
      if (seenUrls.has(src)) continue;
      seenUrls.add(src);

      videos.push({
        id: `video-${videos.length}-${Date.now()}`,
        url: src,
        type: getVideoType(src),
        title: getVideoTitle(el),
        width: el.videoWidth || el.clientWidth || undefined,
        height: el.videoHeight || el.clientHeight || undefined,
        duration: el.duration && isFinite(el.duration) ? el.duration : undefined,
      });
    }
  }

  return videos;
}
