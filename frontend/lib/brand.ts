export const BRAND_ASSETS = {
  logos: {
    stacked: {
      blue: '/brand/bakircilar-v1-blue.png',
      white: '/brand/bakircilar-v1-white.png',
      black: '/brand/bakircilar-v1-black.png',
    },
    horizontal: {
      blue: '/brand/bakircilar-v2-blue.png',
      white: '/brand/bakircilar-v2-white.png',
      black: '/brand/bakircilar-v2-black.png',
    },
  },
  mascot: {
    full: '/maintenance/maskot.png',
    pointing: '/bakir-point.png',
    thumbsUp: '/bakir-thumb.png',
  },
} as const;

export type BrandLogoLayout = keyof typeof BRAND_ASSETS.logos;
export type BrandLogoTone = keyof typeof BRAND_ASSETS.logos.horizontal;
