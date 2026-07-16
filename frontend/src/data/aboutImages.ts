// Re-export shim — canonical source is photoRegistry.ts
export type { PhotoRecord as AboutImage } from './photoRegistry';
export { aboutPhotos as aboutImages, photoSrc, photoSrcset, photoCredit } from './photoRegistry';
