interface DetectedStream {
  url: string;
  streamType: string;
  tabId: number;
  timestamp: number;
}

export class NetworkMonitor {
  private streams: Map<number, DetectedStream[]> = new Map();

  start() {
    chrome.webRequest.onHeadersReceived.addListener(
      (details) => {
        this.handleResponse(details);
        return undefined;
      },
      { urls: ["<all_urls>"] },
      ["responseHeaders"],
    );

    chrome.tabs.onRemoved.addListener((tabId) => {
      this.streams.delete(tabId);
    });
  }

  private handleResponse(
    details: chrome.webRequest.OnHeadersReceivedDetails,
  ) {
    const contentType = details.responseHeaders
      ?.find(
        (h: chrome.webRequest.HttpHeader) =>
          h.name.toLowerCase() === "content-type",
      )
      ?.value?.toLowerCase();

    if (!contentType) return;

    const isVideo =
      contentType.startsWith("video/") ||
      contentType.includes("mpegurl") ||
      contentType.includes("dash+xml") ||
      contentType.includes("octet-stream");

    const isStreamUrl =
      /\.(m3u8|mpd|m4s|ts)(\?|$)/i.test(details.url) ||
      /playurl/i.test(details.url);

    if (isVideo || isStreamUrl) {
      this.addDetectedStream(details.tabId, {
        url: details.url,
        streamType: this.inferType(details.url, contentType),
      });
    }
  }

  private inferType(url: string, contentType: string): string {
    if (url.includes(".m3u8") || contentType.includes("mpegurl")) return "hls";
    if (url.includes(".mpd") || contentType.includes("dash")) return "dash";
    if (url.includes(".m4s")) return "dash";
    return "direct";
  }

  addDetectedStream(
    tabId: number,
    data: { url: string; streamType: string },
  ) {
    if (!this.streams.has(tabId)) {
      this.streams.set(tabId, []);
    }
    const list = this.streams.get(tabId)!;
    if (!list.find((s) => s.url === data.url)) {
      list.push({
        ...data,
        tabId,
        timestamp: Date.now(),
      });
    }
  }

  getDetectedStreams(tabId: number): DetectedStream[] {
    return this.streams.get(tabId) || [];
  }
}
