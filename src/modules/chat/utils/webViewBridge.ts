export const WEBVIEW_BRIDGE_SCRIPT = `
(function() {
  var FORWARD_TYPES = {
    frontend_submit: true,
    agw_frontend_submit: true,
    chat_message: true,
    auth_refresh_request: true,
    frontend_interacted: true,
    frontend_ready: true
  };
  var hasInteracted = false;
  var interactionEvents = ['click', 'input', 'change', 'keydown', 'touchstart'];
  var origPostMessage = window.postMessage;
  function postToRN(payload) {
    if (!window.ReactNativeWebView || !window.ReactNativeWebView.postMessage) {
      return;
    }
    try {
      window.ReactNativeWebView.postMessage(JSON.stringify(payload));
    } catch (e) {}
  }
  function emitReadyPulse() {
    postToRN({ type: 'frontend_ready' });
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
  };
  if (document && document.addEventListener) {
    for (var j = 0; j < interactionEvents.length; j += 1) {
      document.addEventListener(interactionEvents[j], emitInteracted, true);
    }
    document.addEventListener('DOMContentLoaded', emitReadyPulse, false);
  }
  if (window && window.addEventListener) {
    window.addEventListener('load', function() {
      emitReadyPulse();
      setTimeout(emitReadyPulse, 240);
    }, false);
  }
  emitReadyPulse();
  setTimeout(emitReadyPulse, 120);
  true;
})();
`;
