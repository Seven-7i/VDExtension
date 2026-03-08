import { copyFileSync, mkdirSync, existsSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const corePath = dirname(require.resolve("@ffmpeg/core"));
const destDir = resolve(__dirname, "..", "public", "ffmpeg");

if (!existsSync(destDir)) {
  mkdirSync(destDir, { recursive: true });
}

const files = ["ffmpeg-core.js", "ffmpeg-core.wasm"];
for (const file of files) {
  const src = resolve(corePath, file);
  const dest = resolve(destDir, file);
  if (existsSync(src)) {
    copyFileSync(src, dest);
    console.log(`Copied ${file} to public/ffmpeg/`);
  } else {
    console.warn(`Warning: ${src} not found`);
  }
}
