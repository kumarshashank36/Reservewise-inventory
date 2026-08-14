// Shared formatting helpers (were duplicated across list pages).
export const money = (cents) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
export const heldMinutes = (reservation) => Math.max(1, Math.round((new Date(reservation.expiresAt).getTime() - new Date(reservation.createdAt).getTime()) / 60000));
export const formatCountdown = (ms) => { const total = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`; };
