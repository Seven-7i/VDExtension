import { MessageType } from "@/utils/message";
import type { VideoInfo, DownloadTask } from "@/types";
import { VideoType, DownloadStatus } from "@/types";
import { NetworkMonitor } from "./network-monitor";
import { DownloadManager } from "./download-manager";

const LOG = "[VDExtension BG]";

const networkMonitor = new NetworkMonitor();
const downloadManager = new DownloadManager();

networkMonitor.start();
console.log(LOG, "Service worker started");

setupBilibiliRefererRules();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { type, payload } = message;

  switch (type) {
    case MessageType.DOWNLOAD_VIDEO:
      console.log(LOG, "DOWNLOAD_VIDEO received:", payload?.type, payload?.title);
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
      } else {
        sendResponse([]);
      }
      break;

    case MessageType.SCAN_RESULT:
      console.log(LOG, "SCAN_RESULT received:", payload?.length, "videos");
      sendResponse({ success: true });
      break;

    case MessageType.FETCH_MEDIA_RESULT:
      console.log(LOG, "FETCH_MEDIA_RESULT received, taskId:", payload?.taskId);
      downloadManager.handleContentFetchResult(payload);
      sendResponse({ success: true });
      break;

    case MessageType.FETCH_MEDIA_PROGRESS:
      downloadManager.handleContentFetchProgress(payload?.taskId, payload?.progress);
      sendResponse({ success: true });
      break;

    case MessageType.OFFSCREEN_MERGE_RESULT:
      console.log(LOG, "OFFSCREEN_MERGE_RESULT received");
      downloadManager.handleMergeResult(payload);
      sendResponse({ success: true });
      break;

    default:
      sendResponse({ success: true });
      break;
  }

  return true;
});

async function handleDownload(video: VideoInfo, tabId?: number) {
  console.log(LOG, "handleDownload start:", {
    id: video.id,
    type: video.type,
    title: video.title,
    url: video.url?.substring(0, 80),
    audioUrl: video.audioUrl?.substring(0, 80),
  });

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
        console.log(LOG, "Using DIRECT download");
        await downloadManager.downloadDirect(video, (progress) => {
          task.progress = progress;
          broadcastProgress(task, tabId);
        });
        break;

      case VideoType.HLS:
        console.log(LOG, "Using HLS download");
        await downloadManager.downloadHLS(video, (progress, status) => {
          task.progress = progress;
          task.status = status || task.status;
          broadcastProgress(task, tabId);
        });
        break;

      case VideoType.DASH:
      case VideoType.BILIBILI_DASH:
        console.log(LOG, "Using DASH download for type:", video.type, "tabId:", tabId);
        await downloadManager.downloadDASH(video, (progress, status) => {
          task.progress = progress;
          task.status = status || task.status;
          broadcastProgress(task, tabId);
        }, tabId);
        break;

      case VideoType.BLOB:
        console.log(LOG, "Using BLOB download");
        await downloadManager.downloadBlob(video, (progress) => {
          task.progress = progress;
          broadcastProgress(task, tabId);
        });
        break;

      default:
        console.log(LOG, "Using default (DIRECT) download for type:", video.type);
        await downloadManager.downloadDirect(video, (progress) => {
          task.progress = progress;
          broadcastProgress(task, tabId);
        });
    }

    console.log(LOG, "Download completed successfully");
    task.status = DownloadStatus.COMPLETED;
    task.progress = 100;
    broadcastProgress(task, tabId);
  } catch (err) {
    console.error(LOG, "Download FAILED:", err);
    task.status = DownloadStatus.FAILED;
    task.error = err instanceof Error ? err.message : String(err);
    broadcastProgress(task, tabId);
  }
}

async function setupBilibiliRefererRules() {
  const rules: chrome.declarativeNetRequest.Rule[] = [
    {
      id: 1,
      priority: 1,
      action: {
        type: chrome.declarativeNetRequest.RuleActionType.MODIFY_HEADERS,
        requestHeaders: [
          {
            header: "Referer",
            operation: chrome.declarativeNetRequest.HeaderOperation.SET,
            value: "https://www.bilibili.com",
          },
          {
            header: "Origin",
            operation: chrome.declarativeNetRequest.HeaderOperation.SET,
            value: "https://www.bilibili.com",
          },
        ],
      },
      condition: {
        urlFilter: "bilivideo",
        resourceTypes: [
          chrome.declarativeNetRequest.ResourceType.XMLHTTPREQUEST,
          chrome.declarativeNetRequest.ResourceType.OTHER,
          chrome.declarativeNetRequest.ResourceType.MEDIA,
        ],
      },
    },
    {
      id: 2,
      priority: 1,
      action: {
        type: chrome.declarativeNetRequest.RuleActionType.MODIFY_HEADERS,
        requestHeaders: [
          {
            header: "Referer",
            operation: chrome.declarativeNetRequest.HeaderOperation.SET,
            value: "https://www.bilibili.com",
          },
          {
            header: "Origin",
            operation: chrome.declarativeNetRequest.HeaderOperation.SET,
            value: "https://www.bilibili.com",
          },
        ],
      },
      condition: {
        urlFilter: "hdslb.com",
        resourceTypes: [
          chrome.declarativeNetRequest.ResourceType.XMLHTTPREQUEST,
          chrome.declarativeNetRequest.ResourceType.OTHER,
          chrome.declarativeNetRequest.ResourceType.MEDIA,
        ],
      },
    },
    {
      id: 3,
      priority: 1,
      action: {
        type: chrome.declarativeNetRequest.RuleActionType.MODIFY_HEADERS,
        requestHeaders: [
          {
            header: "Referer",
            operation: chrome.declarativeNetRequest.HeaderOperation.SET,
            value: "https://www.bilibili.com",
          },
        ],
      },
      condition: {
        urlFilter: "api.bilibili.com",
        resourceTypes: [
          chrome.declarativeNetRequest.ResourceType.XMLHTTPREQUEST,
          chrome.declarativeNetRequest.ResourceType.OTHER,
        ],
      },
    },
    {
      id: 4,
      priority: 1,
      action: {
        type: chrome.declarativeNetRequest.RuleActionType.MODIFY_HEADERS,
        requestHeaders: [
          {
            header: "Referer",
            operation: chrome.declarativeNetRequest.HeaderOperation.SET,
            value: "https://www.bilibili.com",
          },
          {
            header: "Origin",
            operation: chrome.declarativeNetRequest.HeaderOperation.SET,
            value: "https://www.bilibili.com",
          },
        ],
      },
      condition: {
        urlFilter: "akamaized.net",
        resourceTypes: [
          chrome.declarativeNetRequest.ResourceType.XMLHTTPREQUEST,
          chrome.declarativeNetRequest.ResourceType.OTHER,
          chrome.declarativeNetRequest.ResourceType.MEDIA,
        ],
      },
    },
  ];

  try {
    const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
    console.log(LOG, "Existing dynamic rules:", existingRules.length);
    const removeIds = existingRules.map((r) => r.id);
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: removeIds,
      addRules: rules,
    });
    const verifyRules = await chrome.declarativeNetRequest.getDynamicRules();
    console.log(LOG, "declarativeNetRequest rules set up:", verifyRules.length, "rules active");
    verifyRules.forEach((r) => {
      console.log(LOG, "  Rule", r.id, "condition:", JSON.stringify(r.condition));
    });
  } catch (err) {
    console.error(LOG, "Failed to setup declarativeNetRequest rules:", err);
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
