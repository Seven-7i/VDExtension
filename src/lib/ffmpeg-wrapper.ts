import { FFmpeg } from "@ffmpeg/ffmpeg";

let ffmpeg: FFmpeg | null = null;

export async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpeg && ffmpeg.loaded) return ffmpeg;

  ffmpeg = new FFmpeg();

  ffmpeg.on("log", ({ message }: { message: string }) => {
    console.log("[FFmpeg]", message);
  });

  ffmpeg.on("progress", ({ progress }: { progress: number }) => {
    console.log("[FFmpeg] progress:", Math.round(progress * 100) + "%");
  });

  const coreURL = chrome.runtime.getURL("ffmpeg/ffmpeg-core.js");
  const wasmURL = chrome.runtime.getURL("ffmpeg/ffmpeg-core.wasm");

  console.log("[FFmpeg] Loading with coreURL:", coreURL);
  console.log("[FFmpeg] Loading with wasmURL:", wasmURL);

  await ffmpeg.load({ coreURL, wasmURL });
  console.log("[FFmpeg] Loaded successfully");
  return ffmpeg;
}

export async function mergeHlsSegments(
  segments: Uint8Array[],
): Promise<Uint8Array> {
  const ff = await getFFmpeg();

  const concatList: string[] = [];
  for (let i = 0; i < segments.length; i++) {
    const name = `seg${i}.ts`;
    await ff.writeFile(name, segments[i]);
    concatList.push(`file '${name}'`);
  }

  await ff.writeFile("concat.txt", concatList.join("\n"));

  await ff.exec([
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    "concat.txt",
    "-c",
    "copy",
    "-movflags",
    "+faststart",
    "output.mp4",
  ]);

  const data = await ff.readFile("output.mp4");

  for (let i = 0; i < segments.length; i++) {
    await ff.deleteFile(`seg${i}.ts`);
  }
  await ff.deleteFile("concat.txt");
  await ff.deleteFile("output.mp4");

  return data as Uint8Array;
}

export async function mergeDashStreams(
  videoData: Uint8Array,
  audioData?: Uint8Array,
): Promise<Uint8Array> {
  const ff = await getFFmpeg();

  await ff.writeFile("video.m4s", videoData);

  if (audioData) {
    await ff.writeFile("audio.m4s", audioData);
    await ff.exec([
      "-i",
      "video.m4s",
      "-i",
      "audio.m4s",
      "-c",
      "copy",
      "-movflags",
      "+faststart",
      "output.mp4",
    ]);
    await ff.deleteFile("audio.m4s");
  } else {
    await ff.exec([
      "-i",
      "video.m4s",
      "-c",
      "copy",
      "-movflags",
      "+faststart",
      "output.mp4",
    ]);
  }

  const data = await ff.readFile("output.mp4");
  await ff.deleteFile("video.m4s");
  await ff.deleteFile("output.mp4");

  return data as Uint8Array;
}
