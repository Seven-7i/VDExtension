import { useState, useEffect, useCallback } from "react";
import { MessageType } from "@/utils/message";
import type { VideoInfo, DownloadTask } from "@/types";
import { DownloadStatus } from "@/types";

function App() {
  const [videos, setVideos] = useState<VideoInfo[]>([]);
  const [tasks, setTasks] = useState<DownloadTask[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(false);

  useEffect(() => {
    const listener = (message: { type: MessageType; payload: unknown }) => {
      switch (message.type) {
        case MessageType.SCAN_RESULT:
          setVideos(message.payload as VideoInfo[]);
          setScanning(false);
          setScanned(true);
          break;
        case MessageType.DOWNLOAD_PROGRESS: {
          const task = message.payload as DownloadTask;
          setTasks((prev) => {
            const idx = prev.findIndex((t) => t.id === task.id);
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = task;
              return next;
            }
            return [...prev, task];
          });
          break;
        }
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  const handleScan = useCallback(async () => {
    setScanning(true);
    setScanned(false);
    setVideos([]);
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, {
        type: MessageType.SCAN_VIDEOS,
        payload: null,
      });
    }
  }, []);

  const handleDownload = useCallback(async (video: VideoInfo) => {
    const task: DownloadTask = {
      id: video.id,
      video,
      status: DownloadStatus.PENDING,
      progress: 0,
    };
    setTasks((prev) => [...prev, task]);
    chrome.runtime.sendMessage({
      type: MessageType.DOWNLOAD_VIDEO,
      payload: video,
    });
  }, []);

  const getTaskForVideo = (videoId: string) =>
    tasks.find((t) => t.id === videoId);

  const getStatusText = (task: DownloadTask) => {
    switch (task.status) {
      case DownloadStatus.PENDING:
        return "等待中...";
      case DownloadStatus.DOWNLOADING:
        return `下载中 ${Math.round(task.progress)}%`;
      case DownloadStatus.MERGING:
        return "合并中...";
      case DownloadStatus.COMPLETED:
        return "完成";
      case DownloadStatus.FAILED:
        return `失败: ${task.error || "未知错误"}`;
    }
  };

  const getStatusColor = (status: DownloadStatus) => {
    switch (status) {
      case DownloadStatus.COMPLETED:
        return "text-green-500";
      case DownloadStatus.FAILED:
        return "text-red-500";
      default:
        return "text-blue-500";
    }
  };

  return (
    <div className="w-[380px] min-h-[200px] bg-gray-950 text-gray-100 p-4 font-sans">
      <header className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm">
            VD
          </div>
          <h1 className="text-lg font-semibold text-white">VDExtension</h1>
        </div>
        <span className="text-xs text-gray-500">v0.1.0</span>
      </header>

      <button
        onClick={handleScan}
        disabled={scanning}
        className="w-full py-2.5 px-4 rounded-lg font-medium text-sm transition-all duration-200
          bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500
          active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed
          text-white shadow-lg shadow-violet-500/25"
      >
        {scanning ? (
          <span className="flex items-center justify-center gap-2">
            <svg
              className="animate-spin h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            扫描中...
          </span>
        ) : (
          "扫描视频"
        )}
      </button>

      {scanned && videos.length === 0 && (
        <div className="mt-4 text-center text-gray-500 text-sm py-6">
          未检测到视频
        </div>
      )}

      {videos.length > 0 && (
        <div className="mt-4 space-y-2">
          <div className="text-xs text-gray-400 mb-2">
            检测到 {videos.length} 个视频
          </div>
          {videos.map((video) => {
            const task = getTaskForVideo(video.id);
            const isDownloading =
              task &&
              task.status !== DownloadStatus.COMPLETED &&
              task.status !== DownloadStatus.FAILED;

            return (
              <div
                key={video.id}
                className="bg-gray-900 rounded-lg p-3 border border-gray-800 hover:border-gray-700 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate text-gray-200">
                      {video.title || "未命名视频"}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 uppercase">
                        {video.type}
                      </span>
                      {video.quality && (
                        <span className="text-xs text-gray-500">
                          {video.quality}
                        </span>
                      )}
                      {video.width && video.height && (
                        <span className="text-xs text-gray-500">
                          {video.width}x{video.height}
                        </span>
                      )}
                    </div>
                  </div>
                  {!task ? (
                    <button
                      onClick={() => handleDownload(video)}
                      className="shrink-0 px-3 py-1.5 rounded-md text-xs font-medium
                        bg-violet-600 hover:bg-violet-500 text-white transition-colors"
                    >
                      下载
                    </button>
                  ) : (
                    <span
                      className={`shrink-0 text-xs font-medium ${getStatusColor(task.status)}`}
                    >
                      {getStatusText(task)}
                    </span>
                  )}
                </div>
                {isDownloading && (
                  <div className="mt-2 h-1 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full transition-all duration-300"
                      style={{ width: `${task.progress}%` }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default App;
