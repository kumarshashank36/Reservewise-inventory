import { Button } from './ui/button.jsx';
import { Card, CardContent } from './ui/card.jsx';

export function LoadingState({ label = 'Loading' }) {
  return (
    <Card className="grid min-h-56 place-content-center gap-3 text-center text-sm text-[#53536a]">
      <span className="mx-auto size-6 animate-spin rounded-full border-2 border-[#1e40ff]/20 border-t-[#1e40ff]" />
      {label}…
    </Card>
  );
}
export function ErrorState({ error, retry }) {
  return (
    <Card className="grid min-h-56 place-content-center justify-items-center gap-3 p-7 text-center text-sm text-[#a72f49]">
      <strong className="text-[#14152b]">Something needs attention</strong>
      <span>{error?.message ?? 'Unable to load this information.'}</span>
      {retry && (
        <Button variant="secondary" onClick={retry}>
          Try again
        </Button>
      )}
    </Card>
  );
}
export function EmptyState({ title, detail, action }) {
  return (
    <Card className="grid min-h-56 place-content-center justify-items-center gap-2 p-7 text-center text-sm text-[#53536a]">
      <strong className="text-[#14152b]">{title}</strong>
      <span>{detail}</span>
      {action}
    </Card>
  );
}
