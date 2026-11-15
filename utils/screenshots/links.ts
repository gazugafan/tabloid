import type { WidgetInstance } from '../../types/layout';
import { sanitizeBookmarksConfig } from '../../components/widgets/bookmarks/config';

/** Addresses of the links in Quick links widgets that are set to show screenshots. */
export function collectScreenshotLinks(widgets: readonly WidgetInstance[]): string[] {
  const urls: string[] = [];
  for (const widget of widgets) {
    if (widget.type !== 'bookmarks') continue;
    const config = sanitizeBookmarksConfig(widget.config);
    if (config.display === 'screenshot' && config.layout !== 'list') urls.push(...config.links.map((l) => l.url));
  }
  return urls;
}
