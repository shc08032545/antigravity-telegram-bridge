/**
 * Sequential async task queue that ensures browser interactions
 * (typing prompts, uploading files, reading responses) never overlap.
 */
export class TaskQueue {
  private tail: Promise<void> = Promise.resolve();
  private pendingCount = 0;
  private active = false;

  get size(): number {
    return this.pendingCount;
  }

  get isBusy(): boolean {
    return this.active;
  }

  enqueue<T>(task: () => Promise<T>): Promise<T> {
    this.pendingCount += 1;

    const run = async (): Promise<T> => {
      this.active = true;
      try {
        return await task();
      } finally {
        this.pendingCount = Math.max(0, this.pendingCount - 1);
        this.active = this.pendingCount > 0;
      }
    };

    const resultPromise = this.tail.then(run, run);

    // Keep the chain alive even if an individual task rejects.
    this.tail = resultPromise.then(
      () => undefined,
      () => undefined,
    );

    return resultPromise;
  }
}
