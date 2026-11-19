import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { Workspace } from '../model/workspace';
import { placeBeside } from './place-menu';
import { tabCount, tabPreview } from './tab-preview';

interface Props {
  id: string;
  ws: Workspace;
  /** The sidebar row that the card sits beside. */
  anchor: HTMLElement;
  onMouseEnter(): void;
  onMouseLeave(): void;
}

/** A card that lists the saved tabs of a workspace beside its sidebar row. */
export function TabPreview(props: Props) {
  const card = useRef<HTMLDivElement>(null);
  // Viewport position of the card. It stays null until the card is measured and placed.
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const { labels, more, total } = tabPreview(props.ws.tabs);

  // The card measures again when the tabs change, because its height changes with them.
  useLayoutEffect(() => {
    const el = card.current;
    if (!el) {
      return;
    }
    const box = props.anchor.getBoundingClientRect();
    setPosition(
      placeBeside(
        { top: box.top, left: box.left, width: box.width, height: box.height },
        { width: el.offsetWidth, height: el.offsetHeight },
        { width: window.innerWidth, height: window.innerHeight },
      ),
    );
  }, [props.anchor, props.ws]);

  return (
    <div
      ref={card}
      id={props.id}
      class="tab-preview"
      role="tooltip"
      style={position ? { top: `${position.top}px`, left: `${position.left}px` } : { top: '0px', left: '0px', visibility: 'hidden' }}
      onMouseEnter={props.onMouseEnter}
      onMouseLeave={props.onMouseLeave}
    >
      <div class="tab-preview-head">
        <span class="tab-preview-name">{props.ws.name}</span>
        <span class="tab-preview-count">{tabCount(total)}</span>
      </div>
      {labels.length > 0 ? (
        <ul class="tab-preview-list">
          {labels.map((label, index) => (
            <li key={index}>{label}</li>
          ))}
        </ul>
      ) : (
        <p class="tab-preview-empty">This workspace has no saved tabs.</p>
      )}
      {more > 0 && <p class="tab-preview-more">+{more} more</p>}
    </div>
  );
}
