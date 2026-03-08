export interface VideoInfo {
  id: string;
  url: string;
  type: VideoType;
  title?: string;
  duration?: number;
  width?: number;
  height?: number;
  quality?: string;
  size?: number;
  /** For DASH streams with separate audio */
  audioUrl?: string;
  /** Site-specific metadata */
  meta?: Record<string, unknown>;
}

export enum VideoType {
  DIRECT = "direct",
  BLOB = "blob",
  HLS = "hls",
  DASH = "dash",
  BILIBILI_DASH = "bilibili_dash",
}

export interface DownloadTask {
  id: string;
  video: VideoInfo;
  status: DownloadStatus;
  progress: number;
  filename?: string;
  error?: string;
}

export enum DownloadStatus {
  PENDING = "pending",
  DOWNLOADING = "downloading",
  MERGING = "merging",
  COMPLETED = "completed",
  FAILED = "failed",
}

export interface DashStream {
  id: number;
  url: string;
  backupUrls?: string[];
  bandwidth: number;
  mimeType: string;
  codecs: string;
  width?: number;
  height?: number;
}

export interface DashManifest {
  video: DashStream[];
  audio: DashStream[];
  duration: number;
}

export interface HlsSegment {
  url: string;
  duration: number;
  index: number;
}

export interface HlsManifest {
  segments: HlsSegment[];
  totalDuration: number;
  targetDuration: number;
}

export interface BilibiliVideoInfo {
  bvid: string;
  cid: number;
  title: string;
  partTitle?: string;
  dash: DashManifest;
  qualities: QualityOption[];
}

export interface QualityOption {
  qn: number;
  label: string;
  needLogin: boolean;
  needVip: boolean;
}

export const QUALITY_MAP: Record<number, string> = {
  6: "240P",
  16: "360P",
  32: "480P",
  64: "720P",
  74: "720P60",
  80: "1080P",
  112: "1080P+",
  116: "1080P60",
  120: "4K",
  125: "HDR",
  126: "杜比视界",
  127: "8K",
};
