import type { VideoInfo } from "@/types";
import { DownloadStatus } from "@/types";
import { MessageType } from "@/utils/message";
import { parseHlsManifest } from "@/lib/hls-parser";
import { parseDashManifest } from "@/lib/dash-parser";

const LOG = "[VDExtension DM]";

type ProgressCallback = (
  progress: number,
  status?: DownloadStatus,
) => void;

interface MergeResult {
  taskId: string;
  success: boolean;
  data?: ArrayBuffer;
  error?: string;
}

interface ContentFetchResult {
  videoData?: ArrayBuffer;
  audioData?: ArrayBuffer;
}

export class DownloadManager {
  private pendingMerges: Map<
    string,
    { resolve: (data: ArrayBuffer) => void; reject: (err: Error) => void }
  > = new Map();

  private pendingContentFetches: Map<
    string,
    {
      resolve: (result: ContentFetchResult) => void;
      reject: (err: Error) => void;
      onProgress: ProgressCallback;
    }
  > = new Map();

  handleContentFetchProgress(taskId: string, progress: number) {
    const pending = this.pendingContentFetches.get(taskId);
    if (pending) {
      pending.onProgress(progress);
    }
  }

  handleContentFetchResult(payload: {
    taskId: string;
    success: boolean;
    videoData?: ArrayBuffer;
    audioData?: ArrayBuffer;
    error?: string;
  }) {
    console.log(LOG, "Content fetch result received:", {
      taskId: payload.taskId,
      success: payload.success,
      videoSize: payload.videoData?.byteLength,
      audioSize: payload.audioData?.byteLength,
      error: payload.error,
    });
    const pending = this.pendingContentFetches.get(payload.taskId);
    if (!pending) {
      console.warn(LOG, "No pending content fetch for taskId:", payload.taskId);
      return;
    }
    this.pendingContentFetches.delete(payload.taskId);
    if (payload.success) {
      pending.resolve({ videoData: payload.videoData, audioData: payload.audioData });
    } else {
      pending.reject(new Error(payload.error || "Content fetch failed"));
    }
  }

  private async requestContentFetch(
    tabId: number,
    taskId: string,
    videoUrl: string,
    audioUrl: string,
    onProgress: ProgressCallback,
  ): Promise<ContentFetchResult> {
    return new Promise((resolve, reject) => {
      this.pendingContentFetches.set(taskId, { resolve, reject, onProgress });

      chrome.tabs.sendMessage(tabId, {
        type: MessageType.FETCH_MEDIA_DATA,
        payload: { taskId, videoUrl, audioUrl },
      }).catch((err) => {
        this.pendingContentFetches.delete(taskId);
        reject(new Error(`Failed to send fetch request to tab: ${err}`));
      });
    });
  }

  private async requestContentSaveFiles(
    tabId: number,
    taskId: string,
    videoUrl: string,
    audioUrl: string,
    title: string,
    onProgress: ProgressCallback,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      this.pendingContentFetches.set(taskId, {
        resolve: () => resolve(),
        reject,
        onProgress,
      });

      console.log(LOG, "Sending SAVE_MEDIA_FILES to tab", tabId);
      chrome.tabs.sendMessage(tabId, {
        type: MessageType.SAVE_MEDIA_FILES,
        payload: { taskId, videoUrl, audioUrl, title },
      }).catch((err) => {
        this.pendingContentFetches.delete(taskId);
        reject(new Error(`Failed to send save request to tab: ${err}`));
      });
    });
  }

  async downloadDirect(
    video: VideoInfo,
    onProgress: ProgressCallback,
  ): Promise<void> {
    console.log(LOG, "downloadDirect start", video.url);
    onProgress(10);
    const filename = sanitizeFilename(video.title || "video") + ".mp4";

    await chrome.downloads.download({
      url: video.url,
      filename,
      saveAs: true,
    });
    console.log(LOG, "downloadDirect done");
    onProgress(100);
  }

  async downloadBlob(
    video: VideoInfo,
    onProgress: ProgressCallback,
  ): Promise<void> {
    console.log(LOG, "downloadBlob start", video.url);
    onProgress(10);
    try {
      const response = await fetch(video.url);
      console.log(LOG, "downloadBlob fetch status:", response.status);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const filename = sanitizeFilename(video.title || "video") + ".mp4";

      await chrome.downloads.download({
        url,
        filename,
        saveAs: true,
      });
      console.log(LOG, "downloadBlob done");
      onProgress(100);
    } catch (err) {
      console.error(LOG, "downloadBlob error:", err);
      throw new Error(
        `Blob download failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async downloadHLS(
    video: VideoInfo,
    onProgress: ProgressCallback,
  ): Promise<void> {
    console.log(LOG, "downloadHLS start", video.url);
    onProgress(5);

    const manifestResponse = await fetch(video.url);
    const manifestText = await manifestResponse.text();
    const manifest = parseHlsManifest(manifestText, video.url);
    console.log(LOG, "HLS segments:", manifest.segments.length);

    onProgress(10);

    const segments: ArrayBuffer[] = [];
    for (let i = 0; i < manifest.segments.length; i++) {
      const seg = manifest.segments[i];
      const resp = await fetch(seg.url);
      segments.push(await resp.arrayBuffer());

      const progress = 10 + (i / manifest.segments.length) * 70;
      onProgress(progress);
    }

    console.log(LOG, "HLS all segments downloaded, requesting merge...");
    onProgress(80, DownloadStatus.MERGING);
    await this.ensureOffscreenDocument();

    const mergedData = await this.requestMerge({
      taskId: video.id,
      type: "hls",
      segments,
    });

    console.log(LOG, "HLS merge done, size:", mergedData.byteLength);
    const blob = new Blob([mergedData], { type: "video/mp4" });
    const url = URL.createObjectURL(blob);
    const filename = sanitizeFilename(video.title || "video") + ".mp4";

    await chrome.downloads.download({ url, filename, saveAs: true });
    onProgress(100);
  }

  async downloadDASH(
    video: VideoInfo,
    onProgress: ProgressCallback,
    tabId?: number,
  ): Promise<void> {
    console.log(LOG, "downloadDASH start", {
      type: video.type,
      videoUrl: video.url?.substring(0, 100),
      audioUrl: video.audioUrl?.substring(0, 100),
      title: video.title,
      tabId,
    });
    onProgress(5);

    let videoData: ArrayBuffer;
    let audioData: ArrayBuffer | undefined;

    if (video.type === "bilibili_dash" && video.audioUrl) {
      console.log(LOG, "Bilibili DASH: delegating download+save to content script");
      onProgress(10);

      if (!tabId) {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        tabId = tab?.id;
        console.log(LOG, "Resolved active tabId:", tabId);
      }
      if (!tabId) {
        throw new Error("无法找到目标标签页来下载视频数据");
      }

      const title = sanitizeFilename(video.title || "bilibili_video");
      await this.requestContentSaveFiles(
        tabId, video.id, video.url, video.audioUrl, title, onProgress,
      );

      onProgress(100);
      return;
    } else if (video.audioUrl) {
      console.log(LOG, "Generic DASH with audio...");
      const [videoResp, audioResp] = await Promise.all([
        fetch(video.url),
        fetch(video.audioUrl),
      ]);
      console.log(LOG, "Video status:", videoResp.status, "Audio status:", audioResp.status);
      videoData = await videoResp.arrayBuffer();
      onProgress(40);
      audioData = await audioResp.arrayBuffer();
      onProgress(70);
    } else {
      console.log(LOG, "DASH manifest mode...");
      const manifestResp = await fetch(video.url);
      const manifestText = await manifestResp.text();
      const manifest = parseDashManifest(manifestText, video.url);

      if (manifest.video.length === 0)
        throw new Error("No video streams found");

      const bestVideo = manifest.video.reduce((a, b) =>
        a.bandwidth > b.bandwidth ? a : b,
      );
      const bestAudio =
        manifest.audio.length > 0
          ? manifest.audio.reduce((a, b) =>
              a.bandwidth > b.bandwidth ? a : b,
            )
          : null;

      const videoResp = await fetch(bestVideo.url);
      videoData = await videoResp.arrayBuffer();
      onProgress(50);

      if (bestAudio) {
        const audioResp = await fetch(bestAudio.url);
        audioData = await audioResp.arrayBuffer();
      }
      onProgress(70);
    }

    console.log(LOG, "DASH download done, requesting merge...",
      "videoSize:", videoData.byteLength,
      "audioSize:", audioData?.byteLength || 0);
    onProgress(75, DownloadStatus.MERGING);
    await this.ensureOffscreenDocument();
    console.log(LOG, "Offscreen document ready, sending merge request...");

    const mergedData = await this.requestMerge({
      taskId: video.id,
      type: "dash",
      videoData,
      audioData,
    });

    console.log(LOG, "Merge complete, result size:", mergedData.byteLength);
    const blob = new Blob([mergedData], { type: "video/mp4" });
    const url = URL.createObjectURL(blob);
    const filename = sanitizeFilename(video.title || "video") + ".mp4";

    await chrome.downloads.download({ url, filename, saveAs: true });
    console.log(LOG, "Download triggered for:", filename);
    onProgress(100);
  }

  handleMergeResult(result: MergeResult) {
    console.log(LOG, "Merge result received:", {
      taskId: result.taskId,
      success: result.success,
      dataSize: result.data?.byteLength,
      error: result.error,
    });
    const pending = this.pendingMerges.get(result.taskId);
    if (!pending) {
      console.warn(LOG, "No pending merge found for taskId:", result.taskId);
      return;
    }

    this.pendingMerges.delete(result.taskId);
    if (result.success && result.data) {
      pending.resolve(result.data);
    } else {
      pending.reject(new Error(result.error || "Merge failed"));
    }
  }

  private async requestMerge(data: {
    taskId: string;
    type: string;
    segments?: ArrayBuffer[];
    videoData?: ArrayBuffer;
    audioData?: ArrayBuffer;
  }): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      this.pendingMerges.set(data.taskId, { resolve, reject });
      console.log(LOG, "Sending merge request to offscreen, taskId:", data.taskId);
      chrome.runtime.sendMessage({
        type: MessageType.OFFSCREEN_MERGE,
        payload: data,
      });
    });
  }

  private async ensureOffscreenDocument() {
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    });

    if (existingContexts.length > 0) {
      console.log(LOG, "Offscreen document already exists");
      return;
    }

    console.log(LOG, "Creating offscreen document...");
    await chrome.offscreen.createDocument({
      url: "src/offscreen/index.html",
      reasons: [chrome.offscreen.Reason.WORKERS],
      justification: "FFmpeg.wasm video processing",
    });
    console.log(LOG, "Offscreen document created");
  }
}

function sanitizeFilename(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, 200);
}
