import { MessageType } from "@/utils/message";
import type { VideoInfo } from "@/types";
import { VideoType } from "@/types";
import { scanVideos } from "./scanner";
import { scanBilibiliVideos } from "./bilibili-scanner";
import { createOverlay, removeAllOverlays } from "./overlay";

const detectedStreamUrls: Map<string, { url: string; type: VideoType }> =
  new Map();

function injectPageScript() {
  const script = document.createElement("script");
  script.src = chrome.runtime.getURL("src/content/page-script.ts");
  script.type = "module";
  (document.head || document.documentElement).appendChild(script);
  script.onload = () => script.remove();
}

function listenForPageMessages() {
  window.addEventListener("message", (event) => {
    if (event.source !== window || !event.data?.source) return;
    if (event.data.source !== "vdext-page-script") return;

    const { type, url } = event.data;
    if (type === "stream-detected" && url) {
      const streamType = url.includes(".m3u8")
        ? VideoType.HLS
        : url.includes(".mpd")
          ? VideoType.DASH
          : url.includes(".m4s")
            ? VideoType.DASH
            : VideoType.DIRECT;

      detectedStreamUrls.set(url, { url, type: streamType });

      chrome.runtime.sendMessage({
        type: MessageType.VIDEO_DETECTED,
        payload: { url, streamType },
      });
    }
  });
}

async function handleScan() {
  removeAllOverlays();
  const directVideos = scanVideos();

  const bilibiliVideos = await scanBilibiliVideos(window.location.href);

  const streamVideos: VideoInfo[] = Array.from(
    detectedStreamUrls.values(),
  ).map((stream, i) => ({
    id: `stream-${i}-${Date.now()}`,
    url: stream.url,
    type: stream.type,
    title: document.title,
  }));

  const allVideos = [...bilibiliVideos, ...directVideos, ...streamVideos];

  const uniqueVideos = allVideos.filter(
    (v, i, arr) => arr.findIndex((x) => x.url === v.url) === i,
  );

  uniqueVideos.forEach((video) => {
    const videoElements = document.querySelectorAll("video");
    videoElements.forEach((el) => {
      createOverlay(el, video);
    });
  });

  chrome.runtime.sendMessage({
    type: MessageType.SCAN_RESULT,
    payload: uniqueVideos,
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === MessageType.SCAN_VIDEOS) {
    handleScan();
    sendResponse({ success: true });
  }
  return true;
});

injectPageScript();
listenForPageMessages();
