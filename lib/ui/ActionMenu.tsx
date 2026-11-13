import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "preact/hooks";
import { Fragment, type ComponentChildren } from "preact";
import { Icon } from "./Icon";
import { Ellipsis } from "./icons";
import { menuGroups, menuTarget } from "./menu";
import { placeMenu } from "./place-menu";

export interface MenuItem {
  label: string;
  /** A decorative icon before the label. */
  icon: ComponentChildren;
  danger?: boolean;
  /** A muted hint at the end of the row, such as a shortcut. */
  hint?: string;
  onSelect(): void;
}

interface Props {
  /** The accessible name of the trigger button. */
  label: string;
  /** Marks the trigger so the page can return the focus to it. */
  triggerId: string;
  open: boolean;
  disabled?: boolean;
  /** The groups of items. A divider separates the groups, and an empty group is dropped. */
  groups: MenuItem[][];
  onOpenChange(open: boolean): void;
}

/** A menu button. The page keeps the open state, so only one menu is open at a time. */
export function ActionMenu(props: Props) {
  const { open } = props;
  const groups = menuGroups(props.groups);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const menuId = useId();
  // Viewport position of the open list. It stays null until the list is measured and placed.
  const [position, setPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  // The item that gets the focus when the menu opens: the first, or the last after ArrowUp.
  const firstFocus = useRef<"first" | "last">("first");

  const itemButtons = () => [
    ...(root.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []),
  ];

  useLayoutEffect(() => {
    const menu = list.current;
    if (!open || !menu) {
      setPosition(null);
      return;
    }
    const anchor = (
      trigger.current?.closest(".ws-row") ?? trigger.current
    )?.getBoundingClientRect();
    if (!anchor) {
      return;
    }
    setPosition(
      placeMenu(
        {
          top: anchor.top,
          left: anchor.left,
          width: anchor.width,
          height: anchor.height,
        },
        { width: menu.offsetWidth, height: menu.offsetHeight },
        { width: window.innerWidth, height: window.innerHeight },
      ),
    );
  }, [open]);

  const placed = position !== null;

  useEffect(() => {
    if (!open || !placed) {
      return;
    }
    const buttons = itemButtons();
    (firstFocus.current === "last"
      ? buttons[buttons.length - 1]
      : buttons[0]
    )?.focus();
    const onPointerDown = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) {
        props.onOpenChange(false);
      }
    };
    // The list is fixed to the viewport, so any scroll or resize would leave it detached from its row.
    const onMove = (event: Event) => {
      if (
        event.target instanceof Node &&
        list.current?.contains(event.target)
      ) {
        return;
      }
      const hadFocus = list.current?.contains(document.activeElement) ?? false;
      props.onOpenChange(false);
      if (hadFocus) {
        trigger.current?.focus({ preventScroll: true });
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open, placed]);

  const closeToTrigger = () => {
    props.onOpenChange(false);
    trigger.current?.focus();
  };

  const onMenuKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeToTrigger();
      return;
    }
    const buttons = itemButtons();
    const index = buttons.indexOf(document.activeElement as HTMLElement);
    const target = menuTarget(event.key, index, buttons.length);
    if (target !== null) {
      event.preventDefault();
      buttons[target]?.focus();
    }
  };

  return (
    <div
      class="menu"
      ref={root}
      onFocusOut={(event) => {
        const next = event.relatedTarget as Node | null;
        if (open && next && !root.current?.contains(next)) {
          props.onOpenChange(false);
        }
      }}
    >
      <button
        ref={trigger}
        type="button"
        class="plain menu-trigger"
        data-menu-trigger={props.triggerId}
        aria-label={props.label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={props.disabled}
        onClick={() => {
          firstFocus.current = "first";
          props.onOpenChange(!open);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            firstFocus.current = event.key === "ArrowUp" ? "last" : "first";
            props.onOpenChange(true);
          }
        }}
      >
        <Icon icon={Ellipsis} />
      </button>
      {open && (
        <div
          class="menu-list"
          ref={list}
          id={menuId}
          role="menu"
          aria-label={props.label}
          style={
            position
              ? { top: `${position.top}px`, left: `${position.left}px` }
              : { top: "0px", left: "0px", visibility: "hidden" }
          }
          onKeyDown={onMenuKeyDown}
        >
          {groups.map((group, index) => (
            <Fragment key={group[0]!.label}>
              {index > 0 && <div class="menu-separator" role="separator" />}
              {group.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  class={`plain menu-item${item.danger ? " danger" : ""}`}
                  onClick={() => {
                    closeToTrigger();
                    item.onSelect();
                  }}
                >
                  {item.icon}
                  <span class="menu-label">{item.label}</span>
                  {item.hint && (
                    <span class="menu-hint" aria-hidden="true">
                      {item.hint}
                    </span>
                  )}
                </button>
              ))}
            </Fragment>
          ))}
        </div>
      )}
    </div>
  );
}
