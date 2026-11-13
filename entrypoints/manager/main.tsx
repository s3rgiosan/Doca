import { render } from 'preact';
import '@/lib/ui/theme.css';
import './style.css';
import { App } from './App';

render(<App />, document.getElementById('app')!);
