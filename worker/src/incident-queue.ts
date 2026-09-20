export function createSerialQueue<T>(run: (item: T) => Promise<void>) {
  const queued = new Set<T>();
  let draining: Promise<void> | null = null;

  async function drain() {
    try {
      while (queued.size > 0) {
        const item = queued.values().next().value as T;
        queued.delete(item);
        await run(item);
      }
    } finally {
      draining = null;
      if (queued.size > 0) {
        draining = drain();
      }
    }
  }

  return {
    enqueue(item: T): Promise<void> {
      queued.add(item);
      if (!draining) draining = drain();
      return draining;
    },
  };
}
