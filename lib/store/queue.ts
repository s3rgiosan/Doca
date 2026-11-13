/** The last queued task. Each task starts after the previous one ends. */
let tail: Promise<unknown> = Promise.resolve();

/**
 * Runs read-modify-write tasks one at a time, so that two writes never read the same old value.
 * A failed task does not stop the tasks after it.
 */
export function serial<T>(task: () => Promise<T>): Promise<T> {
  const run = tail.then(task);
  tail = run.catch(() => undefined);
  return run;
}
