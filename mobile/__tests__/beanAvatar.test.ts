import {
  BEAN_COLORS, BEAN_EYES, BEAN_HAIR, BEAN_MOUTHS, BEAN_PRESETS,
  DEFAULT_BEAN_AVATAR, beanAvatarSvg, normalizeBeanAvatar, randomBeanAvatar,
} from '../src/avatars/beanAvatar';

describe('bean avatar profile settings', () => {
  it('handles missing, malformed, and unsupported saved data', () => {
    for (const input of [undefined, null, [], 'bean', { version: 2, color: 'coral' }]) {
      expect(normalizeBeanAvatar(input)).toEqual(DEFAULT_BEAN_AVATAR);
    }
    expect(normalizeBeanAvatar({ version: 1, color: 'pink', eyes: '<script>', mouth: 'oh', hair: 42 })).toEqual({
      ...DEFAULT_BEAN_AVATAR, color: 'pink', mouth: 'oh',
    });
  });

  it('round-trips every preset through the stored profile format', () => {
    for (const preset of BEAN_PRESETS) {
      expect(normalizeBeanAvatar(JSON.parse(JSON.stringify(preset.config)))).toEqual(preset.config);
    }
  });

  it('keeps saved part IDs unique and produces valid random choices', () => {
    for (const options of [BEAN_COLORS, BEAN_EYES, BEAN_MOUTHS, BEAN_HAIR]) {
      expect(new Set(options.map((part) => part.id)).size).toBe(options.length);
    }
    for (let i = 0; i < 100; i++) {
      const config = randomBeanAvatar();
      expect(normalizeBeanAvatar(config)).toEqual(config);
    }
  });

  it('exports only approved artwork and never injects profile strings into SVG', () => {
    const svg = beanAvatarSvg({ version: 1, color: '"><script>alert(1)</script>', eyes: 'wide', hair: 'none', mouth: 'flat' });
    expect(svg).not.toContain('<script>');
    expect(svg).toBe(beanAvatarSvg(DEFAULT_BEAN_AVATAR));
    expect(svg).toContain('viewBox="0 0 128 128"');
  });
});
