import { MessageType } from "@/utils/message";
import type { VideoInfo, DownloadTask } from "@/types";
import { VideoType, DownloadStatus } from "@/types";
import { NetworkMonitor } from "./network-monitor";
import { DownloadManager } from "./download-manager";

const networkMonitor = new NetworkMonitor();
const downloadManager = new DownloadManager();

networkMonitor.start();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { type, payload } = message;

  switch (type) {
    case MessageType.DOWNLOAD_VIDEO:
      handleDownload(payload as VideoInfo, sender.tab?.id);
      sendResponse({ success: true });
      break;

    case MessageType.VIDEO_DETECTED:
      if (sender.tab?.id) {
        networkMonitor.addDetectedStream(sender.tab.id, payload);
      }
      sendResponse({ success: true });
      break;

    case MessageType.GET_VIDEO_LIST:
      if (sender.tab?.id) {
        sendResponse(networkMonitor.getDetectedStreams(sender.tab.id));
      }
      break;

    case MessageType.OFFSCREEN_MERGE_RESULT:
      downloadManager.handleMergeResult(payload);
      sendResponse({ success: true });
      break;
  }

  return true;
});

async function handleDownload(video: VideoInfo, tabId?: number) {
  const task: DownloadTask = {
    id: video.id,
    video,
    status: DownloadStatus.DOWNLOADING,
    progress: 0,
  };

  broadcastProgress(task, tabId);

  try {
    switch (video.type) {
      case VideoType.DIRECT:
        await downloadManager.downloadDirect(video, (progress) => {
          task.progress = progress;
          broadcastProgress(task, tabId);
        });
        break;

      case VideoType.HLS:
        await downloadManager.downloadHLS(video, (progress, status) => {
          task.progress = progress;
          task.status = status || task.status;
          broadcastProgress(task, tabId);
        });
        break;

      case VideoType.DASH:
      case VideoType.BILIBILI_DASH:
        await downloadManager.downloadDASH(video, (progress, status) => {
          task.progress = progress;
          task.status = status || task.status;
          broadcastProgress(task, tabId);
        });
        break;

      case VideoType.BLOB:
        await downloadManager.downloadBlob(video, (progress) => {
          task.progress = progress;
          broadcastProgress(task, tabId);
        });
        break;

      default:
        await downloadManager.downloadDirect(video, (progress) => {
          task.progress = progress;
          broadcastProgress(task, tabId);
        });
    }

    task.status = DownloadStatus.COMPLETED;
    task.progress = 100;
    broadcastProgress(task, tabId);
  } catch (err) {
    task.status = DownloadStatus.FAILED;
    task.error = err instanceof Error ? err.message : String(err);
    broadcastProgress(task, tabId);
  }
}

function broadcastProgress(task: DownloadTask, tabId?: number) {
  chrome.runtime.sendMessage({
    type: MessageType.DOWNLOAD_PROGRESS,
    payload: task,
  }).catch(() => {});

  if (tabId) {
    chrome.tabs.sendMessage(tabId, {
      type: MessageType.DOWNLOAD_PROGRESS,
      payload: task,
    }).catch(() => {});
  }
}
