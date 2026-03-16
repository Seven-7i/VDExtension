/**
 * Injected into the page context (not the content script context)
 * to intercept network requests and MediaSource API calls.
 */
(function () {
  var POST_MSG = "vdext-page-script";

  function notifyStream(url) {
    window.postMessage({ source: POST_MSG, type: "stream-detected", url: url }, "*");
  }

  var originalFetch = window.fetch;
  window.fetch = function () {
    var args = arguments;
    var url =
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

  var originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    var urlStr = String(url);
    if (isStreamUrl(urlStr)) {
      notifyStream(urlStr);
    }
    return originalOpen.apply(this, arguments);
  };

  var originalCreateObjectURL = URL.createObjectURL;
  URL.createObjectURL = function (obj) {
    var url = originalCreateObjectURL.call(URL, obj);
    if (obj instanceof MediaSource) {
      notifyStream(url);
    }
    return url;
  };

  function isStreamUrl(url) {
    var patterns = [
      /\.m3u8/i,
      /\.mpd/i,
      /\.m4s/i,
      /\.ts\?/i,
      /\/manifest/i,
      /\/playlist/i,
      /playurl/i,
      /video\/mp4/i,
    ];
    return patterns.some(function (p) { return p.test(url); });
  }
})();
