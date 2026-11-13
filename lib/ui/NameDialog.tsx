import { useId, useState } from 'preact/hooks';
import { WORKSPACE_COLORS, type WorkspaceColor } from '../model/workspace';
import { Modal } from './Modal';
import { nameToSubmit } from './name';

interface Props {
  title: string;
  /** The name that the field starts with. It is empty for a new workspace. */
  initial: string;
  /** The colour that is selected when the dialog opens. */
  initialColor: WorkspaceColor;
  submitLabel: string;
  busy: boolean;
  /** The error of the last save. It shows inside the dialog. */
  error: string;
  onSubmit(name: string, color: WorkspaceColor): void;
  onCancel(): void;
}

const COLOR_LABELS: Record<WorkspaceColor, string> = {
  red: 'Red',
  orange: 'Orange',
  amber: 'Amber',
  green: 'Green',
  teal: 'Teal',
  blue: 'Blue',
  purple: 'Purple',
  pink: 'Pink',
};

/** A dialog with a "Name" field and a "Colour" choice. Enter saves and Escape cancels. */
export function NameDialog(props: Props) {
  const [text, setText] = useState(props.initial);
  const [color, setColor] = useState(props.initialColor);
  const fieldId = useId();
  const groupName = useId();
  const trimmed = text.trim();
  const changed = trimmed !== props.initial || color !== props.initialColor;
  // A new name or a new colour can save. An unchanged name with a new colour keeps its name.
  const name = trimmed === '' ? null : (nameToSubmit(text, props.initial) ?? (changed ? props.initial : null));

  return (
    <Modal
      title={props.title}
      busy={props.busy}
      onClose={props.onCancel}
      onSubmit={() => name !== null && props.onSubmit(name, color)}
      footer={
        <>
          <button type="button" class="secondary" disabled={props.busy} onClick={props.onCancel}>
            Cancel
          </button>
          <button type="submit" class="primary" disabled={props.busy || name === null}>
            {props.submitLabel}
          </button>
        </>
      }
    >
      <label class="field-label" for={fieldId}>
        Name
      </label>
      <input
        id={fieldId}
        class="field"
        type="text"
        data-autofocus
        autocomplete="off"
        value={text}
        disabled={props.busy}
        onInput={(event) => setText(event.currentTarget.value)}
      />
      <fieldset class="swatches">
        <legend class="field-label">Colour</legend>
        {WORKSPACE_COLORS.map((key) => (
          <label class="swatch" key={key}>
            <input
              type="radio"
              name={groupName}
              value={key}
              checked={color === key}
              disabled={props.busy}
              aria-label={COLOR_LABELS[key]}
              onChange={() => setColor(key)}
            />
            <span class="swatch-circle" style={{ background: `var(--ws-${key})` }} aria-hidden="true" />
          </label>
        ))}
      </fieldset>
      <div role="alert">{props.error && <p class="error">{props.error}</p>}</div>
    </Modal>
  );
}
