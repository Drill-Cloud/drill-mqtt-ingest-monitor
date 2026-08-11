import { CircleHelp } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type TooltipPosition = {
  left: number;
  top: number;
};

export function InfoTooltip({ text }: { text: string }) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const tooltipId = useId();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<TooltipPosition>({ left: 0, top: 0 });

  const updatePosition = () => {
    const bounds = buttonRef.current?.getBoundingClientRect();
    if (!bounds) return;

    setPosition({
      left: Math.min(window.innerWidth - 154, Math.max(154, bounds.left + bounds.width / 2)),
      top: bounds.top - 10,
    });
  };

  const show = () => {
    updatePosition();
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return undefined;

    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open]);

  return (
    <span className="info-tooltip">
      <button
        ref={buttonRef}
        aria-describedby={open ? tooltipId : undefined}
        aria-expanded={open}
        aria-label="Пояснение"
        onBlur={() => setOpen(false)}
        onFocus={show}
        onMouseEnter={show}
        onMouseLeave={() => setOpen(false)}
        type="button"
      >
        <CircleHelp size={14} />
      </button>
      {open && createPortal(
        <span
          className="info-tooltip__content"
          id={tooltipId}
          role="tooltip"
          style={{ left: position.left, top: position.top }}
        >
          {text}
        </span>,
        document.body,
      )}
    </span>
  );
}
