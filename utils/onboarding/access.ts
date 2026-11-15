import { BING_SOURCE, WIKIMEDIA_SOURCE } from '../background/sources';
import { requestHostPermission } from '../sync/shared';
import type { BackgroundChoice } from './choices';

/**
 * Asks to contact the site behind a photo background (nothing to ask for a plain color). Call it
 * straight from a click, with nothing awaited first, or Firefox refuses to show the prompt.
 */
export function requestBackgroundAccess(choice: BackgroundChoice): Promise<void> {
  if (choice === 'bing') return requestHostPermission(BING_SOURCE.origins, BING_SOURCE.label);
  if (choice === 'wikimedia') return requestHostPermission(WIKIMEDIA_SOURCE.origins, WIKIMEDIA_SOURCE.label);
  return Promise.resolve();
}
