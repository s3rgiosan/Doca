/**
 * Returns a runner that starts each user action only after the previous action ends, so that two
 * actions never change the same window or workspace at the same time. A failed action does not stop
 * the actions after it. The queue lives in the worker's memory. It is separate from the storage
 * queue in `serial`, and a `serial` task must never call the runner.
 */
export function createActionQueue(): <T>(action: () => Promise<T>) => Promise<T> {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(action: () => Promise<T>): Promise<T> => {
    const run = tail.then(action);
    tail = run.catch(() => undefined);
    return run;
  };
}
