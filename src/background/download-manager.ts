import type { VideoInfo } from "@/types";
import { DownloadStatus } from "@/types";
import { MessageType } from "@/utils/message";
import { parseHlsManifest } from "@/lib/hls-parser";
import { parseDashManifest } from "@/lib/dash-parser";

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

export class DownloadManager {
  private pendingMerges: Map<
    string,
    { resolve: (data: ArrayBuffer) => void; reject: (err: Error) => void }
  > = new Map();

  async downloadDirect(
    video: VideoInfo,
    onProgress: ProgressCallback,
  ): Promise<void> {
    onProgress(10);
    const filename = sanitizeFilename(video.title || "video") + ".mp4";

    await chrome.downloads.download({
      url: video.url,
      filename,
      saveAs: true,
    });
    onProgress(100);
  }

  async downloadBlob(
    video: VideoInfo,
    onProgress: ProgressCallback,
  ): Promise<void> {
    onProgress(10);
    try {
      const response = await fetch(video.url);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const filename = sanitizeFilename(video.title || "video") + ".mp4";

      await chrome.downloads.download({
        url,
        filename,
        saveAs: true,
      });
      onProgress(100);
    } catch (err) {
      throw new Error(
        `Blob download failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async downloadHLS(
    video: VideoInfo,
    onProgress: ProgressCallback,
  ): Promise<void> {
    onProgress(5);

    const manifestResponse = await fetch(video.url);
    const manifestText = await manifestResponse.text();
    const manifest = parseHlsManifest(manifestText, video.url);

    onProgress(10);

    const segments: ArrayBuffer[] = [];
    for (let i = 0; i < manifest.segments.length; i++) {
      const seg = manifest.segments[i];
      const resp = await fetch(seg.url);
      segments.push(await resp.arrayBuffer());

      const progress = 10 + (i / manifest.segments.length) * 70;
      onProgress(progress);
    }

    onProgress(80, DownloadStatus.MERGING);
    await this.ensureOffscreenDocument();

    const mergedData = await this.requestMerge({
      taskId: video.id,
      type: "hls",
      segments,
    });

    const blob = new Blob([mergedData], { type: "video/mp4" });
    const url = URL.createObjectURL(blob);
    const filename = sanitizeFilename(video.title || "video") + ".mp4";

    await chrome.downloads.download({ url, filename, saveAs: true });
    onProgress(100);
  }

  async downloadDASH(
    video: VideoInfo,
    onProgress: ProgressCallback,
  ): Promise<void> {
    onProgress(5);

    let videoData: ArrayBuffer;
    let audioData: ArrayBuffer | undefined;

    if (video.type === "bilibili_dash" && video.audioUrl) {
      onProgress(10);
      const [videoResp, audioResp] = await Promise.all([
        fetch(video.url, {
          headers: { Referer: "https://www.bilibili.com" },
        }),
        fetch(video.audioUrl, {
          headers: { Referer: "https://www.bilibili.com" },
        }),
      ]);
      videoData = await videoResp.arrayBuffer();
      onProgress(50);
      audioData = await audioResp.arrayBuffer();
      onProgress(70);
    } else if (video.audioUrl) {
      const [videoResp, audioResp] = await Promise.all([
        fetch(video.url),
        fetch(video.audioUrl),
      ]);
      videoData = await videoResp.arrayBuffer();
      onProgress(40);
      audioData = await audioResp.arrayBuffer();
      onProgress(70);
    } else {
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

    onProgress(75, DownloadStatus.MERGING);
    await this.ensureOffscreenDocument();

    const mergedData = await this.requestMerge({
      taskId: video.id,
      type: "dash",
      videoData,
      audioData,
    });

    const blob = new Blob([mergedData], { type: "video/mp4" });
    const url = URL.createObjectURL(blob);
    const filename = sanitizeFilename(video.title || "video") + ".mp4";

    await chrome.downloads.download({ url, filename, saveAs: true });
    onProgress(100);
  }

  handleMergeResult(result: MergeResult) {
    const pending = this.pendingMerges.get(result.taskId);
    if (!pending) return;

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

    if (existingContexts.length > 0) return;

    await chrome.offscreen.createDocument({
      url: "src/offscreen/index.html",
      reasons: [chrome.offscreen.Reason.WORKERS],
      justification: "FFmpeg.wasm video processing",
    });
  }
}

function sanitizeFilename(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, 200);
}
