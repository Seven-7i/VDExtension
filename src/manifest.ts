import { defineManifest } from "@crxjs/vite-plugin";
import packageJson from "../package.json";

const { version } = packageJson;

export default defineManifest({
  manifest_version: 3,
  name: "VDExtension - Video Downloader",
  description: "Scan and download videos from any webpage",
  version,
  icons: {
    "16": "icons/icon-16.png",
    "48": "icons/icon-48.png",
    "128": "icons/icon-128.png",
  },
  action: {
    default_popup: "src/popup/index.html",
    default_icon: {
      "16": "icons/icon-16.png",
      "48": "icons/icon-48.png",
    },
  },
  background: {
    service_worker: "src/background/index.ts",
    type: "module",
  },
  content_scripts: [
    {
      matches: ["<all_urls>"],
      js: ["src/content/index.ts"],
      run_at: "document_idle",
    },
  ],
  permissions: [
    "activeTab",
    "downloads",
    "webRequest",
    "offscreen",
    "storage",
    "tabs",
  ],
  host_permissions: ["<all_urls>"],
  content_security_policy: {
    extension_pages:
      "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';",
  },
  web_accessible_resources: [
    {
      resources: ["src/content/page-script.ts", "icons/*", "ffmpeg/*"],
      matches: ["<all_urls>"],
    },
  ],
});
