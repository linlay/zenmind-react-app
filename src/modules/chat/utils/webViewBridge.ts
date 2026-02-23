export const WEBVIEW_BRIDGE_SCRIPT = `
(function() {
  var FORWARD_TYPES = {
    frontend_submit: true,
    chat_message: true,
    auth_refresh_request: true,
    frontend_interacted: true,
    frontend_ready: true,
    frontend_layout: true
  };
  var hasInteracted = false;
  var interactionEvents = ['click', 'input', 'change', 'keydown', 'touchstart'];
  var origPostMessage = window.postMessage;
  var lastLayoutHeight = 0;
  var layoutTimer = null;
  var layoutThreshold = 6;
  function postToRN(payload) {
    if (!window.ReactNativeWebView || !window.ReactNativeWebView.postMessage) {
      return;
    }
    try {
      window.ReactNativeWebView.postMessage(JSON.stringify(payload));
    } catch (e) {}
  }
  function measureLayoutHeight() {
    var docEl = document && document.documentElement ? document.documentElement : null;
    var body = document && document.body ? document.body : null;
    var heights = [];
    if (docEl) {
      heights.push(docEl.scrollHeight, docEl.offsetHeight, docEl.clientHeight);
    }
    if (body) {
      heights.push(body.scrollHeight, body.offsetHeight, body.clientHeight);
    }
    var maxHeight = 0;
    for (var i = 0; i < heights.length; i += 1) {
      var value = Number(heights[i] || 0);
      if (isFinite(value) && value > maxHeight) {
        maxHeight = value;
      }
    }
    return maxHeight;
  }
  function emitLayout(force) {
    var nextHeight = Math.ceil(measureLayoutHeight());
    if (!isFinite(nextHeight) || nextHeight <= 0) {
      return;
    }
    if (!force && Math.abs(nextHeight - lastLayoutHeight) < layoutThreshold) {
      return;
    }
    lastLayoutHeight = nextHeight;
    postToRN({
      type: 'frontend_layout',
      contentHeight: nextHeight
    });
  }
  function scheduleLayoutProbe(force) {
    if (force) {
      emitLayout(true);
      return;
    }
    if (layoutTimer) {
      return;
    }
    layoutTimer = setTimeout(function() {
      layoutTimer = null;
      emitLayout(false);
    }, 80);
  }
  function emitReadyPulse() {
    postToRN({ type: 'frontend_ready' });
    scheduleLayoutProbe(true);
  }
  function removeInteractionListeners() {
    if (!document || !document.removeEventListener) {
      return;
    }
    for (var i = 0; i < interactionEvents.length; i += 1) {
      document.removeEventListener(interactionEvents[i], emitInteracted, true);
    }
  }
  function emitInteracted() {
    if (hasInteracted) {
      return;
    }
    hasInteracted = true;
    postToRN({ type: 'frontend_interacted' });
    removeInteractionListeners();
  }
  window.postMessage = function(data, targetOrigin) {
    if (data && typeof data === 'object' && FORWARD_TYPES[data.type]) {
      postToRN(data);
    }
    if (typeof origPostMessage === 'function') {
      origPostMessage.call(window, data, targetOrigin);
    }
    if (data && typeof data === 'object') {
      scheduleLayoutProbe(false);
    }
  };
  if (document && document.addEventListener) {
    for (var j = 0; j < interactionEvents.length; j += 1) {
      document.addEventListener(interactionEvents[j], emitInteracted, true);
    }
    document.addEventListener('DOMContentLoaded', emitReadyPulse, false);
    document.addEventListener('DOMContentLoaded', function() {
      scheduleLayoutProbe(true);
    }, false);
  }
  if (window && window.addEventListener) {
    window.addEventListener('load', function() {
      emitReadyPulse();
      setTimeout(emitReadyPulse, 240);
      setTimeout(function() {
        scheduleLayoutProbe(true);
      }, 420);
    }, false);
    window.addEventListener('resize', function() {
      scheduleLayoutProbe(false);
    }, false);
  }
  if (typeof ResizeObserver === 'function') {
    var resizeObserver = new ResizeObserver(function() {
      scheduleLayoutProbe(false);
    });
    if (document && document.documentElement) {
      resizeObserver.observe(document.documentElement);
    }
    if (document && document.body) {
      resizeObserver.observe(document.body);
    }
  } else if (typeof MutationObserver === 'function' && document && document.documentElement) {
    var mutationObserver = new MutationObserver(function() {
      scheduleLayoutProbe(false);
    });
    mutationObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true
    });
  }
  emitReadyPulse();
  setTimeout(emitReadyPulse, 120);
  setTimeout(function() {
    scheduleLayoutProbe(true);
  }, 300);
  true;
})();
`;
