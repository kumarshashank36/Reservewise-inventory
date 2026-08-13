const labels = { pending: 'Pending', completed: 'Completed', cancelled: 'Cancelled', expired: 'Expired' };
export function ReservationStatus({ status }) { return <span className={`status status-${status}`}>{labels[status] ?? status}</span>; }
