import { MessageType } from "@/utils/message";
import { mergeHlsSegments, mergeDashStreams } from "@/lib/ffmpeg-wrapper";

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== MessageType.OFFSCREEN_MERGE) return;

  const { taskId, type, segments, videoData, audioData } = message.payload;

  handleMerge(taskId, type, segments, videoData, audioData)
    .then((data) => {
      chrome.runtime.sendMessage({
        type: MessageType.OFFSCREEN_MERGE_RESULT,
        payload: { taskId, success: true, data },
      });
    })
    .catch((err) => {
      chrome.runtime.sendMessage({
        type: MessageType.OFFSCREEN_MERGE_RESULT,
        payload: {
          taskId,
          success: false,
          error: err instanceof Error ? err.message : String(err),
        },
      });
    });

  sendResponse({ received: true });
  return true;
});

async function handleMerge(
  taskId: string,
  type: string,
  segments?: ArrayBuffer[],
  videoData?: ArrayBuffer,
  audioData?: ArrayBuffer,
): Promise<ArrayBuffer> {
  if (type === "hls" && segments) {
    const uint8Segments = segments.map((s) => new Uint8Array(s));
    const result = await mergeHlsSegments(uint8Segments);
    return result.buffer as ArrayBuffer;
  }

  if (type === "dash" && videoData) {
    const result = await mergeDashStreams(
      new Uint8Array(videoData),
      audioData ? new Uint8Array(audioData) : undefined,
    );
    return result.buffer as ArrayBuffer;
  }

  throw new Error(`Unsupported merge type: ${type} (taskId: ${taskId})`);
}
