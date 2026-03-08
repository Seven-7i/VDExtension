import type { DashManifest, DashStream } from "@/types";

export function parseDashManifest(
  mpdText: string,
  baseUrl: string,
): DashManifest {
  const parser = new DOMParser();
  const doc = parser.parseFromString(mpdText, "application/xml");

  const video: DashStream[] = [];
  const audio: DashStream[] = [];

  const adaptationSets = doc.querySelectorAll("AdaptationSet");

  adaptationSets.forEach((as) => {
    const mimeType =
      as.getAttribute("mimeType") ||
      as.getAttribute("contentType") ||
      "";
    const isVideo =
      mimeType.startsWith("video") ||
      as.getAttribute("contentType") === "video";
    const isAudio =
      mimeType.startsWith("audio") ||
      as.getAttribute("contentType") === "audio";

    const representations = as.querySelectorAll("Representation");
    representations.forEach((rep) => {
      const stream = parseRepresentation(rep, as, baseUrl);
      if (isVideo || (!isAudio && stream.width)) {
        video.push(stream);
      } else if (isAudio) {
        audio.push(stream);
      }
    });
  });

  const durationAttr =
    doc.querySelector("MPD")?.getAttribute("mediaPresentationDuration") || "";
  const duration = parseDuration(durationAttr);

  return { video, audio, duration };
}

function parseRepresentation(
  rep: Element,
  adaptationSet: Element,
  baseUrl: string,
): DashStream {
  const id = parseInt(rep.getAttribute("id") || "0");
  const bandwidth = parseInt(rep.getAttribute("bandwidth") || "0");
  const width = parseInt(rep.getAttribute("width") || "0") || undefined;
  const height = parseInt(rep.getAttribute("height") || "0") || undefined;
  const codecs =
    rep.getAttribute("codecs") ||
    adaptationSet.getAttribute("codecs") ||
    "";
  const mimeType =
    rep.getAttribute("mimeType") ||
    adaptationSet.getAttribute("mimeType") ||
    "";

  const baseUrlEl =
    rep.querySelector("BaseURL") || adaptationSet.querySelector("BaseURL");
  let url = baseUrlEl?.textContent || "";

  if (url && !url.startsWith("http")) {
    url = resolveUrl(url, baseUrl);
  }

  const segmentBase = rep.querySelector("SegmentBase");
  if (segmentBase && !url) {
    url = baseUrl;
  }

  return {
    id,
    url,
    bandwidth,
    mimeType,
    codecs,
    width,
    height,
  };
}

function parseDuration(iso: string): number {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?/);
  if (!match) return 0;
  const hours = parseInt(match[1] || "0");
  const minutes = parseInt(match[2] || "0");
  const seconds = parseFloat(match[3] || "0");
  return hours * 3600 + minutes * 60 + seconds;
}

function resolveUrl(url: string, baseUrl: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  try {
    return new URL(url, baseUrl).href;
  } catch {
    const basePath = baseUrl.substring(0, baseUrl.lastIndexOf("/") + 1);
    return basePath + url;
  }
}
