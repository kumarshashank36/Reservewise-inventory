export const CATEGORIES = [
  { value: 'electronics', label: 'Electronics' },
  { value: 'furniture', label: 'Furniture' },
  { value: 'clothing', label: 'Clothing' },
  { value: 'home', label: 'Home & Living' },
  { value: 'stationery', label: 'Stationery' }
];

export function categoryLabel(value) {
  if (!value || value === 'misc') return '';
  return CATEGORIES.find((category) => category.value === value)?.label ?? '';
}
