import { useState } from 'react';
import { categoryLabel } from '../categories.js';

const FALLBACK_GRADIENTS = {
  electronics: ['#243b7a', '#627ccf'],
  furniture: ['#6b4a2b', '#b98a5e'],
  clothing: ['#a53c4e', '#d98a99'],
  home: ['#2f6b57', '#7ab8a4'],
  stationery: ['#8a5a1e', '#c9a25e'],
};

// Pictogram shown instead of a letter tile when no artwork exists or it fails.
const FALLBACK_ICONS = {
  electronics: '🎧',
  furniture: '🛋️',
  clothing: '👕',
  home: '🏠',
  stationery: '✒️',
  misc: '📦',
};

// Renders the product image; if none is set or it fails to load, shows a
// design-native per-category gradient tile with a category pictogram instead,
// so cards never break and never show bare initials. A `size` hint asks
// Unsplash for a width-matched variant (auto=format serves WebP/AVIF), so rows
// and cards never download full-size photos — full-size decoding is the main
// source of scroll jank in the customer catalog.
export function ProductImage({ product, className = '', size = null }) {
  const [failed, setFailed] = useState(false);
  if (!product.imageUrl || failed) {
    const [from, to] = FALLBACK_GRADIENTS[product.category] ?? FALLBACK_GRADIENTS.home;
    return (
      <div
        className={`product-image product-image-fallback ${className}`}
        style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}
        role="img"
        aria-label={`${product.name} — ${categoryLabel(product.category) || 'Product'} artwork`}
      >
        <span>{FALLBACK_ICONS[product.category] ?? FALLBACK_ICONS.misc}</span>
      </div>
    );
  }
  let src = product.imageUrl;
  if (size && src.includes('images.unsplash.com')) {
    try {
      const url = new URL(src);
      url.searchParams.set('w', String(size));
      url.searchParams.set('auto', 'format');
      src = url.toString();
    } catch {
      /* keep the original on malformed URLs */
    }
  }
  return (
    <img
      className={`product-image ${className}`}
      src={src}
      alt={product.name}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}
