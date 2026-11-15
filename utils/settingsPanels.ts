/** The options page shows one panel at a time. Each has an id for the URL hash and the section anchors inside it. */
export interface SettingsPanel {
  id: string;
  label: string;
  /** Other hashes (section ids) that open this panel. */
  anchors: string[];
}

export const SETTINGS_PANELS: readonly SettingsPanel[] = [
  { id: 'appearance', label: 'Appearance', anchors: [] },
  { id: 'background', label: 'Background', anchors: [] },
  { id: 'sync', label: 'Sync & backup', anchors: ['data'] },
  { id: 'help', label: 'Welcome & tour', anchors: ['welcome'] },
];

/** The panel a URL hash such as "#data" belongs to (the first panel when the hash is empty or unknown). */
export function panelForHash(hash: string): SettingsPanel {
  const id = hash.replace(/^#/, '');
  return SETTINGS_PANELS.find((p) => p.id === id || p.anchors.includes(id)) ?? SETTINGS_PANELS[0]!;
}
