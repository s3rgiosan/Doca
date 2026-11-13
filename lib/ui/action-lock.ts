export interface ActionLock {
  busy(): boolean;
  /** Runs the action unless another one runs. A skipped action returns undefined. */
  run<T>(action: () => Promise<T>): Promise<T | undefined>;
}

/** Lets one async action run at a time. The listener gets each change of the busy state. */
export function createActionLock(onChange: (busy: boolean) => void = () => {}): ActionLock {
  let busy = false;
  return {
    busy: () => busy,
    async run(action) {
      if (busy) {
        return undefined;
      }
      busy = true;
      onChange(true);
      try {
        return await action();
      } finally {
        busy = false;
        onChange(false);
      }
    },
  };
}
