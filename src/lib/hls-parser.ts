import type { HlsManifest, HlsSegment } from "@/types";

export function parseHlsManifest(
  manifestText: string,
  baseUrl: string,
): HlsManifest {
  const lines = manifestText.split("\n").map((l) => l.trim());
  const segments: HlsSegment[] = [];
  let targetDuration = 0;
  let currentDuration = 0;
  let index = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("#EXT-X-TARGETDURATION:")) {
      targetDuration = parseFloat(line.split(":")[1]);
      continue;
    }

    if (line.startsWith("#EXTINF:")) {
      currentDuration = parseFloat(line.split(":")[1].split(",")[0]);
      continue;
    }

    if (line.startsWith("#EXT-X-STREAM-INF:")) {
      const nextLine = lines[i + 1];
      if (nextLine && !nextLine.startsWith("#")) {
        return parseHlsManifest(
          /* fetch the variant playlist */
          manifestText,
          baseUrl,
        );
      }
      continue;
    }

    if (line && !line.startsWith("#")) {
      const segmentUrl = resolveUrl(line, baseUrl);
      segments.push({
        url: segmentUrl,
        duration: currentDuration,
        index: index++,
      });
      currentDuration = 0;
    }
  }

  const totalDuration = segments.reduce((sum, s) => sum + s.duration, 0);

  return {
    segments,
    totalDuration,
    targetDuration,
  };
}

export function isMasterPlaylist(manifestText: string): boolean {
  return manifestText.includes("#EXT-X-STREAM-INF:");
}

export function parseMasterPlaylist(
  manifestText: string,
  baseUrl: string,
): { bandwidth: number; url: string; resolution?: string }[] {
  const lines = manifestText.split("\n").map((l) => l.trim());
  const variants: { bandwidth: number; url: string; resolution?: string }[] =
    [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("#EXT-X-STREAM-INF:")) {
      const bandwidthMatch = line.match(/BANDWIDTH=(\d+)/);
      const resolutionMatch = line.match(/RESOLUTION=([\dx]+)/);
      const nextLine = lines[i + 1];

      if (bandwidthMatch && nextLine && !nextLine.startsWith("#")) {
        variants.push({
          bandwidth: parseInt(bandwidthMatch[1]),
          url: resolveUrl(nextLine, baseUrl),
          resolution: resolutionMatch?.[1],
        });
      }
    }
  }

  return variants.sort((a, b) => b.bandwidth - a.bandwidth);
}

function resolveUrl(url: string, baseUrl: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }
  try {
    return new URL(url, baseUrl).href;
  } catch {
    const basePath = baseUrl.substring(0, baseUrl.lastIndexOf("/") + 1);
    return basePath + url;
  }
}
