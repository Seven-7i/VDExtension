import type { VideoInfo } from "@/types";
import { MessageType } from "@/utils/message";

const OVERLAY_CLASS = "vdext-download-overlay";

export function createOverlay(
  videoEl: HTMLVideoElement,
  video: VideoInfo,
): void {
  const existing = videoEl.parentElement?.querySelector(`.${OVERLAY_CLASS}`);
  if (existing) return;

  const parent = videoEl.parentElement;
  if (!parent) return;

  const computedStyle = window.getComputedStyle(parent);
  if (computedStyle.position === "static") {
    parent.style.position = "relative";
  }

  const overlay = document.createElement("div");
  overlay.className = OVERLAY_CLASS;
  Object.assign(overlay.style, {
    position: "absolute",
    top: "12px",
    right: "12px",
    zIndex: "2147483647",
    display: "flex",
    gap: "8px",
    pointerEvents: "auto",
  });

  const btn = document.createElement("button");
  Object.assign(btn.style, {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    padding: "8px 16px",
    borderRadius: "8px",
    border: "none",
    background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
    color: "#fff",
    fontSize: "13px",
    fontWeight: "600",
    cursor: "pointer",
    boxShadow: "0 4px 12px rgba(124,58,237,0.4)",
    transition: "all 0.2s ease",
    opacity: "0.9",
    fontFamily: "system-ui, -apple-system, sans-serif",
  });

  btn.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
    <span>下载</span>
  `;

  btn.addEventListener("mouseenter", () => {
    btn.style.opacity = "1";
    btn.style.transform = "scale(1.05)";
  });

  btn.addEventListener("mouseleave", () => {
    btn.style.opacity = "0.9";
    btn.style.transform = "scale(1)";
  });

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    btn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="animate-spin">
        <circle cx="12" cy="12" r="10" opacity="0.25"/>
        <path d="M4 12a8 8 0 018-8" opacity="0.75"/>
      </svg>
      <span>下载中...</span>
    `;
    btn.style.pointerEvents = "none";

    chrome.runtime.sendMessage({
      type: MessageType.DOWNLOAD_VIDEO,
      payload: video,
    });
  });

  overlay.appendChild(btn);
  parent.appendChild(overlay);
}

export function removeAllOverlays(): void {
  document.querySelectorAll(`.${OVERLAY_CLASS}`).forEach((el) => el.remove());
}
