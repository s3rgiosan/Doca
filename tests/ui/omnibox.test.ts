import { describe, expect, it } from 'vitest';
import { newWorkspace } from '@/lib/model/workspace';
import { resolveOmnibox, suggestWorkspaces } from '@/lib/ui/omnibox';

const ws = (id: string, name: string) => newWorkspace({ id, name, deviceId: 'd', now: 0 });
const all = [ws('1', 'Client X'), ws('2', 'Research <b>'), ws('3', 'Client Y')];

describe('omnibox', () => {
  it('suggests workspaces whose name contains the text', () => {
    expect(suggestWorkspaces('cli', all).map((s) => s.content)).toEqual(['Client X', 'Client Y']);
  });

  it('escapes markup in the description', () => {
    expect(suggestWorkspaces('res', all)[0]!.description).toBe('Research &lt;b&gt;');
  });

  it('resolves an exact name first, then the first match', () => {
    expect(resolveOmnibox('client y', all)).toBe('3');
    expect(resolveOmnibox('cli', all)).toBe('1');
    expect(resolveOmnibox('zzz', all)).toBeNull();
  });
});
