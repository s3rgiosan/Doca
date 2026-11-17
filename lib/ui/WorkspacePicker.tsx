import { useEffect, useId, useMemo, useRef, useState } from 'preact/hooks';
import type { Workspace } from '../model/workspace';
import { Icon } from './Icon';
import { ChevronDown } from './icons';
import { WorkspaceDot } from './WorkspaceDot';
import { activeOptionId, isPickable, nextHighlight, optionId, pickerRows, type PickerRow } from './picker';

interface Props {
  workspaces: Workspace[];
  bound: Set<string>;
  currentId: string | undefined;
  showCurrent: boolean;
  /** Text in the field while the list is closed. */
  label: string;
  /** The workspace that `label` names. Its dot shows in the closed field. */
  labelWorkspace?: Workspace;
  placeholder: string;
  /** The accessible name of the field. A visible `<label for>` that names `inputId` can give it instead. */
  ariaLabel?: string;
  /** The id of the input, for a `<label for>`. */
  inputId?: string;
  disabled?: boolean;
  onPick(row: PickerRow): void;
  /** Called with the open state of the list each time it changes. */
  onOpenChange?(open: boolean): void;
}

/** A search field with a list of workspaces under it. Typing filters the list. */
export function WorkspacePicker(props: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(-1);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();

  const rows = useMemo(
    () => pickerRows(props.workspaces, { currentId: props.currentId, showCurrent: props.showCurrent, bound: props.bound, query }),
    [props.workspaces, props.currentId, props.showCurrent, props.bound, query],
  );

  // The rows and the query as of the last render, to tell a new query from a refresh of the rows.
  const previous = useRef({ rows, query });
  useEffect(() => {
    const before = previous.current;
    previous.current = { rows, query };
    setHighlight(nextHighlight(before, { rows, query }, highlight));
  }, [rows, query]);

  useEffect(() => {
    props.onOpenChange?.(open);
  }, [open]);

  useEffect(() => {
    if (open && highlight >= 0) {
      document.getElementById(optionId(listId, highlight))?.scrollIntoView?.({ block: 'nearest' });
    }
  }, [open, highlight]);

  const close = () => {
    setOpen(false);
    setQuery('');
  };

  const pick = (row: PickerRow | undefined) => {
    if (!row || !isPickable(row)) {
      return;
    }
    close();
    props.onPick(row);
  };

  /** Moves the highlight to the next row that can be picked, in the given direction. */
  const step = (direction: 1 | -1) => {
    for (let i = 1; i <= rows.length; i++) {
      const next = (highlight + direction * i + rows.length) % rows.length;
      if (isPickable(rows[next]!)) {
        setHighlight(next);
        return;
      }
    }
  };

  const onKeyDown = (event: KeyboardEvent) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setOpen(true);
        step(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        setOpen(true);
        step(-1);
        break;
      case 'Enter':
        event.preventDefault();
        if (open) {
          pick(rows[highlight]);
        } else {
          setOpen(true);
        }
        break;
      case 'Escape':
        if (open) {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
        break;
      default:
        break;
    }
  };

  const text = (row: PickerRow) => {
    if (row.kind === 'new') {
      return row.name === '' ? '+ New workspace' : `+ New workspace "${row.name}"`;
    }
    return row.ws.name;
  };

  return (
    <div class="picker">
      <div class="picker-field">
        {!open && props.labelWorkspace && (
          <span class="picker-dot">
            <WorkspaceDot ws={props.labelWorkspace} />
          </span>
        )}
        <input
          ref={input}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-activedescendant={activeOptionId(open, highlight, rows.length, listId)}
          aria-autocomplete="list"
          aria-label={props.ariaLabel}
          id={props.inputId}
          class={!open && props.labelWorkspace ? 'with-dot' : undefined}
          disabled={props.disabled}
          placeholder={open ? 'Find or create a workspace' : props.placeholder}
          value={open ? query : props.label}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onBlur={close}
          onInput={(event) => {
            setOpen(true);
            setQuery(event.currentTarget.value);
          }}
          onKeyDown={onKeyDown}
        />
        <span class={`picker-chevron${open ? ' open' : ''}`}>
          <Icon icon={ChevronDown} size={16} />
        </span>
      </div>
      {open && (
        <ul class="picker-list" id={listId} role="listbox">
          {rows.map((row, index) => (
            <li
              key={row.kind === 'new' ? 'new' : row.ws.id}
              id={optionId(listId, index)}
              role="option"
              aria-selected={index === highlight ? true : undefined}
              aria-disabled={!isPickable(row)}
              class={`picker-row${row.kind === 'new' ? ' new' : ''}${index === highlight ? ' highlight' : ''}${isPickable(row) ? '' : ' disabled'}`}
              // The input keeps the focus, so the blur does not close the list before the click.
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => isPickable(row) && setHighlight(index)}
              onClick={() => pick(row)}
            >
              {row.kind === 'workspace' && <WorkspaceDot ws={row.ws} />}
              <span>{text(row)}</span>
              {row.kind === 'workspace' && row.current && <span class="picker-current"> – current</span>}
              {row.kind === 'workspace' && !row.current && props.bound.has(row.ws.id) && <span class="picker-open">open</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
