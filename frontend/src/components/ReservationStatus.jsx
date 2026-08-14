import { Badge } from './ui/badge.jsx';

const labels = { pending: 'Pending', completed: 'Completed', cancelled: 'Cancelled', expired: 'Expired' };
const variants = { pending: 'warning', completed: 'success', cancelled: 'muted', expired: 'muted' };
export function ReservationStatus({ status }) {
  return <Badge variant={variants[status] ?? 'muted'}>{labels[status] ?? status}</Badge>;
}
