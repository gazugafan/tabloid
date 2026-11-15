/**
 * Messages between a Webpages widget and the small script (entrypoints/frame-bridge.ts) that runs inside its frames.
 * A page in another site's frame can't be read by Tabloid, so the script tells the widget where the frame is, which
 * lets the widget offer back and forward.
 *
 * The script posts its address only to Tabloid's origin, so the browser drops it when the frame is on any other page.
 * It keeps watching for address changes only after Tabloid answers.
 */

/** The registered content script's id, and its file in the built extension. */
export const FRAME_BRIDGE_ID = 'tabloid-frame-bridge';
export const FRAME_BRIDGE_FILE = 'frame-bridge.js';

export interface FrameLocationMessage {
  tabloid: 'frame-location';
  url: string;
}
export interface FrameAckMessage {
  tabloid: 'frame-ack';
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

export const isFrameAck = (data: unknown): data is FrameAckMessage => isRecord(data) && data.tabloid === 'frame-ack';

/**
 * The address a frame reported, if the message is well formed and the address really belongs to the origin that sent
 * it (so a frame can't claim to be somewhere else). Only http(s) addresses are accepted.
 */
export function frameLocation(data: unknown, origin: string): string | undefined {
  if (!isRecord(data) || data.tabloid !== 'frame-location' || typeof data.url !== 'string') return undefined;
  try {
    const url = new URL(data.url);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined;
    return url.origin === origin ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}
