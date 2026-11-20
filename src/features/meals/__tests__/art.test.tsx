import { screen } from '@testing-library/react-native';

import { renderThemed, SCHEMES } from '../../../../test/render';

import { colors } from '@/theme';

import { RecipeArt } from '../components/RecipeArt';
import { artPalette, mixColor, recipeArt, recipeImageUrl, TINT_TOKEN } from '../logic/art';

describe('recipeArt (pure)', () => {
  it('title keywords beat the protein, the protein beats the slot', () => {
    expect(recipeArt({ title: 'Red lentil soup', mainProtein: 'legumes', slot: 'lunch' }).glyph).toBe('soup');
    expect(recipeArt({ title: 'Chicken karahi', mainProtein: 'chicken' }).glyph).toBe('pot');
    expect(recipeArt({ title: 'Grilled chicken', mainProtein: 'chicken' }).glyph).toBe('drumstick');
    expect(recipeArt({ title: 'Miso cod', mainProtein: 'fish' }).glyph).toBe('fish');
    expect(recipeArt({ title: 'Prawn stir fry', mainProtein: 'shellfish' }).glyph).toBe('shrimp');
    expect(recipeArt({ title: 'Mystery', slot: 'snack' }).glyph).toBe('apple');
    expect(recipeArt({}).glyph).toBe('plate');
  });

  it('tints by cuisine, else by slot, and keeps the photo id', () => {
    expect(recipeArt({ cuisine: 'pakistani' }).tint).toBe('warm');
    expect(recipeArt({ cuisine: 'italian' }).tint).toBe('fresh');
    expect(recipeArt({ cuisine: 'global', slots: ['snack'] }).tint).toBe('berry');
    expect(recipeArt({ mediaId: 'repwise/recipes/x' }).mediaId).toBe('repwise/recipes/x');
    expect(recipeArt({ title: 'Lentil soup' }).label).toBe('Soup');
  });

  it('mixColor blends hex tokens and falls back for non-hex', () => {
    const { textPrimary, bg, scrim, surface } = colors.light; // black, white, rgba scrim
    expect(mixColor(bg, textPrimary, 1)).toBe(bg.toUpperCase());
    expect(mixColor(bg, textPrimary, 0)).toBe(textPrimary.toUpperCase());
    expect(mixColor(bg, textPrimary, 0.5)).toBe(`#${'80'.repeat(3)}`);
    expect(mixColor(scrim, surface, 0.5)).toBe(surface);
  });

  it.each(SCHEMES)('palette is a soft token-derived gradient (%s)', (scheme) => {
    for (const tint of Object.keys(TINT_TOKEN) as (keyof typeof TINT_TOKEN)[]) {
      const p = artPalette(tint, colors[scheme], scheme);
      expect(p.from).toMatch(/^#[0-9A-F]{6}$/);
      expect(p.from).not.toBe(p.to);
      expect(p.glyph).not.toBe(p.from);
    }
  });

  it('photo URL only for a cloud name and a safe recipe id', () => {
    expect(recipeImageUrl('repwise/recipes/chicken-karahi', 'thumb', 'demo')).toContain('/demo/image/upload/');
    expect(recipeImageUrl('repwise/recipes/chicken-karahi', 'hero', 'demo')).toContain('w_960');
    expect(recipeImageUrl('repwise/recipes/chicken-karahi', 'thumb', null)).toBeNull();
    expect(recipeImageUrl('../../etc', 'thumb', 'demo')).toBeNull();
    expect(recipeImageUrl(null, 'thumb', 'demo')).toBeNull();
  });
});

describe.each(SCHEMES)('RecipeArt (%s)', (scheme) => {
  it('renders the glyph placeholder (never a broken image) without a photo', async () => {
    await renderThemed(<RecipeArt art={recipeArt({ title: 'Lentil soup' })} testID="art" />, scheme);
    expect(screen.getByTestId('art-glyph-soup', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByTestId('art-photo', { includeHiddenElements: true })).toBeNull();
  });

  it('hero is spoken as an image when labelled', async () => {
    await renderThemed(
      <RecipeArt art={recipeArt({ title: 'Miso cod', mainProtein: 'fish' })} size="hero" accessibilityLabel="Fish dish: Miso cod" testID="hero" />,
      scheme,
    );
    expect(screen.getByLabelText('Fish dish: Miso cod')).toBeTruthy();
  });

  it('shows the photo slot when a cloud name and mediaId exist', async () => {
    const prev = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME;
    process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME = 'demo';
    await renderThemed(<RecipeArt art={recipeArt({ mediaId: 'repwise/recipes/miso-cod' })} testID="art" />, scheme);
    expect(screen.getByTestId('art-photo', { includeHiddenElements: true })).toBeTruthy();
    process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME = prev;
  });
});
