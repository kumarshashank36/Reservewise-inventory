import { useState } from 'react';
import { categoryLabel } from '../categories.js';

const FALLBACK_GRADIENTS = {
  electronics: ['#243b7a', '#627ccf'],
  furniture: ['#6b4a2b', '#b98a5e'],
  clothing: ['#a53c4e', '#d98a99'],
  home: ['#2f6b57', '#7ab8a4'],
  stationery: ['#8a5a1e', '#c9a25e']
};

// Renders the product image; if none is set or it fails to load, shows a
// design-native per-category gradient tile instead, so cards never break.
export function ProductImage({ product, className = '' }) {
  const [failed, setFailed] = useState(false);
  if (!product.imageUrl || failed) {
    const [from, to] = FALLBACK_GRADIENTS[product.category] ?? FALLBACK_GRADIENTS.home;
    return <div className={`product-image product-image-fallback ${className}`} style={{ background: `linear-gradient(135deg, ${from}, ${to})` }} role="img" aria-label={`${product.name} — ${categoryLabel(product.category) || 'Product'} artwork`}><span>{product.name.charAt(0).toUpperCase()}</span></div>;
  }
  return <img className={`product-image ${className}`} src={product.imageUrl} alt={product.name} loading="lazy" onError={() => setFailed(true)} />;
}
