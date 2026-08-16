import { Info } from 'lucide-react';

export function InfoHint({ text }: { text: string }) {
  return (
    <span className="info-hint" tabIndex={0} aria-label={text}>
      <Info aria-hidden="true" />
      <span role="tooltip">{text}</span>
    </span>
  );
}
