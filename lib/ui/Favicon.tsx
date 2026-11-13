import { useEffect, useState } from 'preact/hooks';

/** The favicon of a tab. An empty slot takes its place when the icon is missing or fails to load. */
export function Favicon(props: { src: string | undefined }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [props.src]);
  if (!props.src || failed) {
    return <span class="favicon" aria-hidden="true" />;
  }
  return <img class="favicon" src={props.src} alt="" onError={() => setFailed(true)} />;
}
