export function LoadingState({ label = 'Loading' }) { return <div className="state-panel"><span className="spinner" />{label}…</div>; }
export function ErrorState({ error, retry }) { return <div className="state-panel error-state"><strong>Something needs attention</strong><span>{error?.message ?? 'Unable to load this information.'}</span>{retry && <button className="button button-secondary" onClick={retry}>Try again</button>}</div>; }
export function EmptyState({ title, detail, action }) { return <div className="state-panel"><strong>{title}</strong><span>{detail}</span>{action}</div>; }
