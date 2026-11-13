import type { ComponentChildren } from 'preact';
import { useId } from 'preact/hooks';
import { Modal } from './Modal';

interface Props {
  title: string;
  children: ComponentChildren;
  confirmLabel: string;
  /** The look of the confirm button. A danger button is the default. */
  confirmTone?: 'danger' | 'primary';
  /** A third choice between Cancel and the confirm button, for example "Discard". */
  alternativeLabel?: string;
  onAlternative?(): void;
  /** Disables the buttons while the action runs. */
  busy?: boolean;
  onConfirm(): void;
  onCancel(): void;
}

/** A modal dialog that asks for a decision. Escape or Cancel closes it. */
export function ConfirmDialog(props: Props) {
  const bodyId = useId();
  return (
    <Modal
      title={props.title}
      busy={props.busy}
      describedBy={bodyId}
      onClose={props.onCancel}
      footer={
        <>
          <button type="button" class="secondary" data-autofocus disabled={props.busy} onClick={props.onCancel}>
            Cancel
          </button>
          {props.alternativeLabel && (
            <button type="button" class="secondary" disabled={props.busy} onClick={() => props.onAlternative?.()}>
              {props.alternativeLabel}
            </button>
          )}
          <button
            type="button"
            class={props.confirmTone === 'primary' ? 'primary' : 'danger-button'}
            disabled={props.busy}
            onClick={props.onConfirm}
          >
            {props.confirmLabel}
          </button>
        </>
      }
    >
      <p class="modal-text" id={bodyId}>
        {props.children}
      </p>
    </Modal>
  );
}
