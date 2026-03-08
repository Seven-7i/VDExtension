export enum MessageType {
  SCAN_VIDEOS = "SCAN_VIDEOS",
  SCAN_RESULT = "SCAN_RESULT",
  DOWNLOAD_VIDEO = "DOWNLOAD_VIDEO",
  DOWNLOAD_PROGRESS = "DOWNLOAD_PROGRESS",
  DOWNLOAD_COMPLETE = "DOWNLOAD_COMPLETE",
  DOWNLOAD_ERROR = "DOWNLOAD_ERROR",
  VIDEO_DETECTED = "VIDEO_DETECTED",
  GET_VIDEO_LIST = "GET_VIDEO_LIST",
  OFFSCREEN_MERGE = "OFFSCREEN_MERGE",
  OFFSCREEN_MERGE_RESULT = "OFFSCREEN_MERGE_RESULT",
}

export interface Message<T = unknown> {
  type: MessageType;
  payload: T;
  tabId?: number;
}

export function sendToBackground<T = unknown>(
  type: MessageType,
  payload: T,
): Promise<unknown> {
  return chrome.runtime.sendMessage({ type, payload });
}

export function sendToTab<T = unknown>(
  tabId: number,
  type: MessageType,
  payload: T,
): Promise<unknown> {
  return chrome.tabs.sendMessage(tabId, { type, payload });
}

export function sendToOffscreen<T = unknown>(
  type: MessageType,
  payload: T,
): Promise<unknown> {
  return chrome.runtime.sendMessage({ type, payload, target: "offscreen" });
}
