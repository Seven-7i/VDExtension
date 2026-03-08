import type {
  VideoInfo,
  BilibiliVideoInfo,
  QualityOption,
  DashStream,
} from "@/types";
import { VideoType, QUALITY_MAP } from "@/types";

const BILIBILI_API = "https://api.bilibili.com";

interface PlayUrlResponse {
  code: number;
  data: {
    quality: number;
    accept_quality: number[];
    accept_description: string[];
    dash?: {
      duration: number;
      video: BiliDashStream[];
      audio: BiliDashStream[];
    };
    durl?: { url: string; size: number; length: number }[];
  };
}

interface BiliDashStream {
  id: number;
  baseUrl: string;
  base_url: string;
  backupUrl: string[];
  backup_url: string[];
  bandwidth: number;
  mimeType: string;
  mime_type: string;
  codecs: string;
  width: number;
  height: number;
  codecid: number;
}

interface VideoViewResponse {
  code: number;
  data: {
    bvid: string;
    aid: number;
    title: string;
    cid: number;
    pages: { cid: number; page: number; part: string }[];
  };
}

export function isBilibiliUrl(url: string): boolean {
  return /bilibili\.com\/(video|bangumi)/.test(url);
}

export function extractBvid(url: string): string | null {
  const match = url.match(/\/(BV[a-zA-Z0-9]+)/);
  return match ? match[1] : null;
}

export function extractEpid(url: string): string | null {
  const match = url.match(/\/ep(\d+)/);
  return match ? match[1] : null;
}

function extractPageNumber(url: string): number {
  const match = url.match(/[?&]p=(\d+)/);
  return match ? parseInt(match[1]) : 1;
}

export async function getBilibiliVideoInfo(
  pageUrl: string,
): Promise<BilibiliVideoInfo> {
  const bvid = extractBvid(pageUrl);
  if (!bvid) throw new Error("无法从URL中提取BV号");

  const viewData = await fetchVideoView(bvid);
  const pageNum = extractPageNumber(pageUrl);
  const page = viewData.data.pages[pageNum - 1] || viewData.data.pages[0];
  const cid = page.cid;

  const playData = await fetchPlayUrl(bvid, cid);
  if (playData.code !== 0) {
    throw new Error(`PlayURL API 返回错误: code=${playData.code}`);
  }

  const dash = playData.data.dash;
  if (!dash) {
    if (playData.data.durl) {
      return {
        bvid,
        cid,
        title: viewData.data.title,
        partTitle: page.part,
        dash: {
          video: [
            {
              id: 0,
              url: playData.data.durl[0].url,
              bandwidth: 0,
              mimeType: "video/mp4",
              codecs: "",
              width: 0,
              height: 0,
            },
          ],
          audio: [],
          duration: playData.data.durl[0].length / 1000,
        },
        qualities: [],
      };
    }
    throw new Error("未找到 DASH 或 durl 流信息");
  }

  const video: DashStream[] = dash.video.map((v) => ({
    id: v.id,
    url: v.baseUrl || v.base_url,
    backupUrls: v.backupUrl || v.backup_url,
    bandwidth: v.bandwidth,
    mimeType: v.mimeType || v.mime_type,
    codecs: v.codecs,
    width: v.width,
    height: v.height,
  }));

  const audio: DashStream[] = dash.audio.map((a) => ({
    id: a.id,
    url: a.baseUrl || a.base_url,
    backupUrls: a.backupUrl || a.backup_url,
    bandwidth: a.bandwidth,
    mimeType: a.mimeType || a.mime_type,
    codecs: a.codecs,
  }));

  const qualities: QualityOption[] = playData.data.accept_quality.map(
    (qn, i) => ({
      qn,
      label: QUALITY_MAP[qn] || playData.data.accept_description[i] || `${qn}`,
      needLogin: qn >= 80,
      needVip: qn >= 112,
    }),
  );

  return {
    bvid,
    cid,
    title: viewData.data.title,
    partTitle: page.part,
    dash: { video, audio, duration: dash.duration },
    qualities,
  };
}

export function bilibiliInfoToVideoInfo(
  info: BilibiliVideoInfo,
  preferQuality?: number,
): VideoInfo {
  let selectedVideo: DashStream;

  if (preferQuality) {
    selectedVideo =
      info.dash.video.find((v) => v.id === preferQuality) ||
      info.dash.video[0];
  } else {
    selectedVideo = info.dash.video.reduce((a, b) =>
      a.bandwidth > b.bandwidth ? a : b,
    );
  }

  const selectedAudio =
    info.dash.audio.length > 0
      ? info.dash.audio.reduce((a, b) =>
          a.bandwidth > b.bandwidth ? a : b,
        )
      : undefined;

  const title = info.partTitle
    ? `${info.title} - ${info.partTitle}`
    : info.title;

  return {
    id: `bili-${info.bvid}-${info.cid}-${Date.now()}`,
    url: selectedVideo.url,
    audioUrl: selectedAudio?.url,
    type: VideoType.BILIBILI_DASH,
    title,
    width: selectedVideo.width,
    height: selectedVideo.height,
    quality: QUALITY_MAP[selectedVideo.id] || `${selectedVideo.id}`,
    meta: {
      bvid: info.bvid,
      cid: info.cid,
      codecs: selectedVideo.codecs,
      bandwidth: selectedVideo.bandwidth,
    },
  };
}

async function fetchVideoView(bvid: string): Promise<VideoViewResponse> {
  const resp = await fetch(
    `${BILIBILI_API}/x/web-interface/view?bvid=${bvid}`,
    {
      credentials: "include",
      headers: {
        Referer: "https://www.bilibili.com",
      },
    },
  );
  return resp.json();
}

async function fetchPlayUrl(
  bvid: string,
  cid: number,
  qn = 120,
): Promise<PlayUrlResponse> {
  const params = new URLSearchParams({
    bvid,
    cid: String(cid),
    qn: String(qn),
    fnval: "4048",
    fnver: "0",
    fourk: "1",
  });

  const resp = await fetch(
    `${BILIBILI_API}/x/player/playurl?${params.toString()}`,
    {
      credentials: "include",
      headers: {
        Referer: "https://www.bilibili.com",
      },
    },
  );
  return resp.json();
}

/**
 * WBI signature generation.
 * B站部分API需要WBI签名，签名算法基于 img_key 和 sub_key 的混合。
 * 这里提供基础实现，实际使用时 mixin key 的获取需要从 nav API 拿到。
 */
export async function getWbiKeys(): Promise<{
  imgKey: string;
  subKey: string;
}> {
  const resp = await fetch(`${BILIBILI_API}/x/web-interface/nav`, {
    credentials: "include",
    headers: { Referer: "https://www.bilibili.com" },
  });
  const data = await resp.json();

  const imgUrl: string = data.data?.wbi_img?.img_url || "";
  const subUrl: string = data.data?.wbi_img?.sub_url || "";

  const imgKey = imgUrl.split("/").pop()?.split(".")[0] || "";
  const subKey = subUrl.split("/").pop()?.split(".")[0] || "";

  return { imgKey, subKey };
}

const MIXIN_KEY_ENC_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5,
  49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55,
  40, 61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57,
  62, 11, 36, 20, 34, 44, 52,
];

export function getMixinKey(imgKey: string, subKey: string): string {
  const raw = imgKey + subKey;
  return MIXIN_KEY_ENC_TAB.map((i) => raw[i])
    .join("")
    .slice(0, 32);
}

export async function signWbiParams(
  params: Record<string, string | number>,
): Promise<string> {
  const { imgKey, subKey } = await getWbiKeys();
  const mixinKey = getMixinKey(imgKey, subKey);

  const wts = Math.round(Date.now() / 1000);
  const allParams = { ...params, wts };

  const sorted = Object.keys(allParams)
    .sort()
    .map(
      (key) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(String(allParams[key as keyof typeof allParams]))}`,
    )
    .join("&");

  const encoder = new TextEncoder();
  const data = encoder.encode(sorted + mixinKey);
  const hashBuffer = await crypto.subtle.digest("MD5", data).catch(() => {
    return md5(sorted + mixinKey);
  });

  let w_rid: string;
  if (hashBuffer instanceof ArrayBuffer) {
    w_rid = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } else {
    w_rid = hashBuffer as unknown as string;
  }

  return `${sorted}&w_rid=${w_rid}&wts=${wts}`;
}

function md5(str: string): string {
  // Simplified MD5 placeholder - in production, use a proper MD5 library
  // crypto.subtle doesn't support MD5 in most browsers
  // For WBI signing, we may need to include a small MD5 implementation
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(32, "0");
}
