import { render } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { Settings } from '@/lib/ui/Settings';
import '@/lib/ui/theme.css';
import './style.css';

/** The settings page. The browser asks before it leaves the page while a change is not saved. */
function OptionsPage() {
  const dirty = useRef(false);

  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (dirty.current) {
        event.preventDefault();
        // Some browsers ask only when the event has a return value.
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, []);

  return (
    <main class="options">
      <h1>Doca settings</h1>
      <div class="options-panel">
        <Settings headingLevel={2} onDirtyChange={(value) => (dirty.current = value)} />
      </div>
    </main>
  );
}

render(<OptionsPage />, document.getElementById('app')!);
