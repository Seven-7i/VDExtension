/**
 * This script is injected into the page context (not the content script context)
 * to intercept network requests and MediaSource API calls.
 */
(function () {
  const POST_MSG = "vdext-page-script";

  function notifyStream(url: string) {
    window.postMessage({ source: POST_MSG, type: "stream-detected", url }, "*");
  }

  const originalFetch = window.fetch;
  window.fetch = function (...args: Parameters<typeof fetch>) {
    const url =
      typeof args[0] === "string"
        ? args[0]
        : args[0] instanceof Request
          ? args[0].url
          : String(args[0]);

    if (isStreamUrl(url)) {
      notifyStream(url);
    }
    return originalFetch.apply(this, args);
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (
    method: string,
    url: string | URL,
    ...rest: unknown[]
  ) {
    const urlStr = String(url);
    if (isStreamUrl(urlStr)) {
      notifyStream(urlStr);
    }
    return (originalOpen as Function).call(this, method, url, ...rest);
  };

  const originalCreateObjectURL = URL.createObjectURL;
  URL.createObjectURL = function (obj: Blob | MediaSource) {
    const url = originalCreateObjectURL.call(URL, obj);
    if (obj instanceof MediaSource) {
      notifyStream(url);
    }
    return url;
  };

  function isStreamUrl(url: string): boolean {
    const patterns = [
      /\.m3u8/i,
      /\.mpd/i,
      /\.m4s/i,
      /\.ts\?/i,
      /\/manifest/i,
      /\/playlist/i,
      /playurl/i,
      /video\/mp4/i,
    ];
    return patterns.some((p) => p.test(url));
  }
})();
