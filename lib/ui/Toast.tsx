import { useEffect, useRef } from 'preact/hooks';
import { createDismissTimer, type DismissTimer } from './dismiss-timer';
import { Icon } from './Icon';
import { X } from './icons';

export interface ToastMessage {
  /** A new key for each toast, so that each toast gets its full time on screen. */
  key: number;
  text: string;
  /** The label of the action button, for example "Undo". A toast with no label has no action. */
  actionLabel?: string;
  onAction?(): void;
}

interface Props {
  toast: ToastMessage | null;
  /** Disables the action button while another action runs. */
  busy?: boolean;
  onClose(): void;
}

/**
 * Shows one short message at the bottom of the page, with an optional action and a close button.
 * The text is in a status live region that stays in the page, so screen readers announce each new
 * message. The toast closes after at least 10 seconds, and never while it has the pointer or the
 * focus. Escape closes it when the focus is in it.
 */
export function Toast(props: Props) {
  const region = useRef<HTMLDivElement>(null);
  const timer = useRef<DismissTimer | null>(null);
  const onClose = useRef(props.onClose);
  onClose.current = props.onClose;
  const { toast } = props;
  const key = toast?.key;

  useEffect(() => {
    if (key === undefined) {
      return;
    }
    const next = createDismissTimer(() => onClose.current());
    // A toast that replaces another one can appear under the pointer or the focus.
    const element = region.current;
    if (element?.matches(':hover')) {
      next.hold('hover');
    }
    if (element?.contains(document.activeElement)) {
      next.hold('focus');
    }
    timer.current = next;
    return () => {
      next.stop();
      timer.current = null;
    };
  }, [key]);

  return (
    <div
      ref={region}
      class={`toast${toast ? ' shown' : ''}`}
      onMouseEnter={() => timer.current?.hold('hover')}
      onMouseLeave={() => timer.current?.release('hover')}
      onFocusIn={() => timer.current?.hold('focus')}
      onFocusOut={(event) => {
        const next = event.relatedTarget;
        if (!(next instanceof Node) || !region.current?.contains(next)) {
          timer.current?.release('focus');
        }
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && toast) {
          event.stopPropagation();
          props.onClose();
        }
      }}
    >
      <p class="toast-text" role="status">
        {toast?.text ?? ''}
      </p>
      {toast && (
        <div class="toast-actions">
          {toast.actionLabel && (
            <button type="button" class="plain toast-action" disabled={props.busy} onClick={() => toast.onAction?.()}>
              {toast.actionLabel}
            </button>
          )}
          <button type="button" class="plain toast-close" aria-label="Dismiss" onClick={props.onClose}>
            <Icon icon={X} />
          </button>
        </div>
      )}
    </div>
  );
}
