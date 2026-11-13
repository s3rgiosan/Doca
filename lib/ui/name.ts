/** Returns the trimmed name to save, or null when the name is empty or did not change. */
export function nameToSubmit(text: string, initial: string): string | null {
  const name = text.trim();
  if (name === '' || name === initial) {
    return null;
  }
  return name;
}
