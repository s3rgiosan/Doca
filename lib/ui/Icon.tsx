import type { LucideIcon } from './icons';

/** Draws a decorative icon in the color of the text around it. */
export function Icon(props: { icon: LucideIcon; size?: number }) {
  const Glyph = props.icon;
  return <Glyph size={props.size ?? 18} aria-hidden="true" class="icon" />;
}
