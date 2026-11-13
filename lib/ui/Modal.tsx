import type { ComponentChildren } from 'preact';
import { useEffect, useId, useRef } from 'preact/hooks';
import { Icon } from './Icon';
import { X } from './icons';

interface Props {
  title: string;
  children: ComponentChildren;
  /** The buttons in the footer, right-aligned. */
  footer?: ComponentChildren;
  /** A modal with a wide layout, such as the settings. */
  wide?: boolean;
  /** Ignores Escape and the close button while an action runs. */
  busy?: boolean;
  /** Makes the body and the footer a form, so Enter submits it. */
  onSubmit?(): void;
  /** The id of the element that describes the dialog. */
  describedBy?: string;
  onClose(): void;
}

/**
 * A modal dialog with a title, a close button, a body and a footer. Escape closes it. The element
 * with `data-autofocus` gets the focus when the dialog opens.
 */
export function Modal(props: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const element = dialog.current;
    if (!element) {
      return;
    }
    element.showModal();
    const target = element.querySelector<HTMLElement>('[data-autofocus]');
    target?.focus();
    if (target instanceof HTMLInputElement) {
      target.select();
    }
  }, []);

  const content = (
    <>
      <div class="modal-body">{props.children}</div>
      {props.footer && <footer class="modal-foot">{props.footer}</footer>}
    </>
  );

  return (
    <dialog
      ref={dialog}
      class={`modal${props.wide ? ' wide' : ''}`}
      aria-labelledby={titleId}
      aria-describedby={props.describedBy}
      onCancel={(event) => {
        event.preventDefault();
        if (!props.busy) {
          props.onClose();
        }
      }}
    >
      <header class="modal-head">
        <h2 id={titleId}>{props.title}</h2>
        <button type="button" class="plain modal-close" aria-label="Close" disabled={props.busy} onClick={props.onClose}>
          <Icon icon={X} />
        </button>
      </header>
      {props.onSubmit ? (
        <form
          class="modal-form"
          onSubmit={(event) => {
            event.preventDefault();
            props.onSubmit?.();
          }}
        >
          {content}
        </form>
      ) : (
        content
      )}
    </dialog>
  );
}
