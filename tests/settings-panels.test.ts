import { describe, expect, it } from 'vitest';
import { SETTINGS_PANELS, panelForHash } from '../utils/settingsPanels';

describe('settings panels', () => {
  it('opens the panel a hash points to, including section anchors inside it', () => {
    expect(panelForHash('#background').id).toBe('background');
    expect(panelForHash('#sync').id).toBe('sync');
    expect(panelForHash('#data').id).toBe('sync');
    expect(panelForHash('#welcome').id).toBe('help');
  });

  it('falls back to the first panel for an empty or unknown hash', () => {
    expect(panelForHash('').id).toBe(SETTINGS_PANELS[0]!.id);
    expect(panelForHash('#nope').id).toBe(SETTINGS_PANELS[0]!.id);
  });
});
