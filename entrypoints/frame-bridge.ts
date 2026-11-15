import { browser } from 'wxt/browser';
import { isFrameAck, type FrameLocationMessage } from '../utils/frames/bridge';

/**
 * Runs in frames on any site, but only while a Webpages widget uses "show sites that block embedding" (Tabloid
 * registers it then, and removes it when no widget needs it). It does nothing unless it's directly inside a Tabloid
 * page: its one message is addressed to Tabloid's origin, which the browser drops anywhere else.
 */
export default defineUnlistedScript(() => {
  if (window === window.top || window.parent !== window.top) return;
  const tabloid = browser.runtime.getURL('/').replace(/\/$/, '');
  let last = '';
  const report = () => {
    if (location.href === last) return;
    last = location.href;
    const message: FrameLocationMessage = { tabloid: 'frame-location', url: last };
    window.parent.postMessage(message, tabloid);
  };

  const onMessage = (event: MessageEvent) => {
    if (event.source !== window.parent || event.origin !== tabloid || !isFrameAck(event.data)) return;
    window.removeEventListener('message', onMessage);
    // Tabloid is listening: follow address changes that don't load a new page (sites that update the address themselves).
    addEventListener('popstate', report);
    addEventListener('hashchange', report);
    setInterval(report, 1000);
  };
  window.addEventListener('message', onMessage);
  report();
});
