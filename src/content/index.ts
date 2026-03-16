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
  script.src = chrome.runtime.getURL("page-script.js");
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

  const videoElements = document.querySelectorAll("video");
  if (videoElements.length > 0 && uniqueVideos.length > 0) {
    if (uniqueVideos.length === 1) {
      videoElements.forEach((el) => {
        createOverlay(el, uniqueVideos[0]);
      });
    } else {
      uniqueVideos.forEach((video, i) => {
        const el = videoElements[i] || videoElements[videoElements.length - 1];
        createOverlay(el, video);
      });
    }
  }

  chrome.runtime.sendMessage({
    type: MessageType.SCAN_RESULT,
    payload: uniqueVideos,
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === MessageType.SCAN_VIDEOS) {
    handleScan();
    sendResponse({ success: true });
  } else if (message.type === MessageType.FETCH_MEDIA_DATA) {
    const { taskId, videoUrl, audioUrl } = message.payload;
    sendResponse({ success: true, started: true });
    handleFetchMediaData(taskId, videoUrl, audioUrl);
  } else if (message.type === MessageType.SAVE_MEDIA_FILES) {
    const { taskId, videoUrl, audioUrl, title } = message.payload;
    sendResponse({ success: true, started: true });
    handleSaveMediaFiles(taskId, videoUrl, audioUrl, title);
  }
  return true;
});

async function fetchWithProgress(
  url: string,
  label: string,
  taskId: string,
  baseProgress: number,
  progressRange: number,
): Promise<ArrayBuffer> {
  console.log(`[VDExtension] ${label} fetching:`, url.substring(0, 120));
  const resp = await fetch(url, { referrerPolicy: "origin" });
  console.log(`[VDExtension] ${label} fetch status:`, resp.status);
  if (!resp.ok) {
    throw new Error(`${label} fetch failed: ${resp.status}`);
  }

  const contentLength = parseInt(resp.headers.get("Content-Length") || "0");
  console.log(`[VDExtension] ${label} Content-Length:`, contentLength);

  if (!contentLength || !resp.body) {
    const data = await resp.arrayBuffer();
    console.log(`[VDExtension] ${label} downloaded:`, data.byteLength, "bytes");
    return data;
  }

  const reader = resp.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  let lastReportedPercent = -1;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;

    const percent = Math.round((received / contentLength) * 100);
    if (percent !== lastReportedPercent && percent % 5 === 0) {
      lastReportedPercent = percent;
      const overallProgress = baseProgress + (received / contentLength) * progressRange;
      console.log(`[VDExtension] ${label}: ${percent}% (${(received / 1024 / 1024).toFixed(1)}MB)`);
      chrome.runtime.sendMessage({
        type: MessageType.FETCH_MEDIA_PROGRESS,
        payload: { taskId, progress: Math.round(overallProgress) },
      }).catch(() => {});
    }
  }

  const totalSize = chunks.reduce((sum, c) => sum + c.length, 0);
  const result = new Uint8Array(totalSize);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  console.log(`[VDExtension] ${label} complete:`, totalSize, "bytes",
    `(${(totalSize / 1024 / 1024).toFixed(1)}MB)`);
  return result.buffer;
}

async function handleFetchMediaData(
  taskId: string,
  videoUrl: string,
  audioUrl?: string,
): Promise<void> {
  console.log("[VDExtension] Content fetching media data, taskId:", taskId);

  try {
    const videoData = await fetchWithProgress(videoUrl, "Video", taskId, 10, 40);

    let audioData: ArrayBuffer | undefined;
    if (audioUrl) {
      audioData = await fetchWithProgress(audioUrl, "Audio", taskId, 50, 20);
    }

    console.log("[VDExtension] All media downloaded, sending to background...",
      "video:", videoData.byteLength, "audio:", audioData?.byteLength || 0);

    chrome.runtime.sendMessage({
      type: MessageType.FETCH_MEDIA_RESULT,
      payload: { taskId, success: true, videoData, audioData },
    }).catch((err) => {
      console.error("[VDExtension] Failed to send media data to background:", err);
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[VDExtension] Media fetch FAILED:", errMsg);
    chrome.runtime.sendMessage({
      type: MessageType.FETCH_MEDIA_RESULT,
      payload: { taskId, success: false, error: errMsg },
    }).catch(() => {});
  }
}

function saveBlobAsFile(data: ArrayBuffer, filename: string) {
  const blob = new Blob([data], { type: "video/mp4" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 1000);
}

async function handleSaveMediaFiles(
  taskId: string,
  videoUrl: string,
  audioUrl: string,
  title: string,
): Promise<void> {
  console.log("[VDExtension] Saving media files locally, taskId:", taskId);

  try {
    const videoData = await fetchWithProgress(videoUrl, "Video", taskId, 10, 40);
    console.log("[VDExtension] Video downloaded, saving as file...");
    saveBlobAsFile(videoData, `${title}_video.mp4`);

    let audioSaved = false;
    if (audioUrl) {
      const audioData = await fetchWithProgress(audioUrl, "Audio", taskId, 50, 20);
      console.log("[VDExtension] Audio downloaded, saving as file...");
      saveBlobAsFile(audioData, `${title}_audio.mp4`);
      audioSaved = true;
    }

    console.log("[VDExtension] Files saved. Merge with:");
    console.log(`ffmpeg -i "${title}_video.mp4" -i "${title}_audio.mp4" -c copy "${title}.mp4"`);

    chrome.runtime.sendMessage({
      type: MessageType.FETCH_MEDIA_RESULT,
      payload: { taskId, success: true, audioSaved },
    }).catch(() => {});
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[VDExtension] Save media files FAILED:", errMsg);
    chrome.runtime.sendMessage({
      type: MessageType.FETCH_MEDIA_RESULT,
      payload: { taskId, success: false, error: errMsg },
    }).catch(() => {});
  }
}

injectPageScript();
listenForPageMessages();
