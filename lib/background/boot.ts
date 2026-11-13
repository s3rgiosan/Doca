/**
 * Returns a function that runs `start` once per worker life and gives every caller the same promise.
 * A failed start is forgotten, so the next caller tries again.
 */
export function createBoot(start: () => Promise<void>): () => Promise<void> {
  let booting: Promise<void> | null = null;
  return () => {
    booting ??= start().catch((error: unknown) => {
      booting = null;
      throw error;
    });
    return booting;
  };
}
