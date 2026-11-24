import { describe, expect, it } from 'vitest';
import { TaskQueue } from '../src/utils/queue.js';

describe('TaskQueue', () => {
  it('executes enqueued tasks strictly in FIFO order', async () => {
    const queue = new TaskQueue();
    const order: string[] = [];

    const p1 = queue.enqueue(async () => {
      order.push('start-1');
      await new Promise((r) => setTimeout(r, 30));
      order.push('end-1');
      return 1;
    });

    const p2 = queue.enqueue(async () => {
      order.push('start-2');
      order.push('end-2');
      return 2;
    });

    expect(queue.size).toBe(2);
    const [r1, r2] = await Promise.all([p1, p2]);

    expect(r1).toBe(1);
    expect(r2).toBe(2);
    expect(order).toEqual(['start-1', 'end-1', 'start-2', 'end-2']);
    expect(queue.size).toBe(0);
    expect(queue.isBusy).toBe(false);
  });

  it('continues processing subsequent tasks after an error', async () => {
    const queue = new TaskQueue();

    const failing = queue.enqueue(async () => {
      throw new Error('boom');
    });

    const succeeding = queue.enqueue(async () => 'ok');

    await expect(failing).rejects.toThrow('boom');
    await expect(succeeding).resolves.toBe('ok');
    expect(queue.size).toBe(0);
    expect(queue.isBusy).toBe(false);
  });
});
