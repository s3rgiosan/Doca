import { useEffect, useState } from 'preact/hooks';

/** Only secure web images and inline images load. Other schemes show the empty slot. */
function isSafeSource(src: string): boolean {
  return src.startsWith('https:') || src.startsWith('data:image/');
}

/** The favicon of a tab. An empty slot takes its place when the icon is missing or fails to load. */
export function Favicon(props: { src: string | undefined }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [props.src]);
  if (!props.src || failed || !isSafeSource(props.src)) {
    return <span class="favicon" aria-hidden="true" />;
  }
  return <img class="favicon" src={props.src} alt="" referrerpolicy="no-referrer" onError={() => setFailed(true)} />;
}
