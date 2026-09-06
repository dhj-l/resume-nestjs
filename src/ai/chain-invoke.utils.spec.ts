import { RunnableLambda } from '@langchain/core/runnables';
import { invokeChainWithRetry } from './chain-invoke.utils';

describe('invokeChainWithRetry - AI 链调用统一脚手架', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  // queueMicrotask 不能被 fake，否则 promise 链被阻塞导致 advance 永不生效
  const useFakeTimers = () =>
    jest.useFakeTimers({ doNotFake: ['queueMicrotask'] });

  const makeChain = () => ({ invoke: jest.fn() });

  it('should return the chain result on first success', async () => {
    const chain = makeChain();
    chain.invoke.mockResolvedValue({ answer: 42 });

    const result = await invokeChainWithRetry<{ answer: number }>(
      chain,
      { question: 'q' },
      { timeoutMs: 1000, retries: 2, label: '测试调用' },
    );

    expect(result).toEqual({ answer: 42 });
    expect(chain.invoke).toHaveBeenCalledTimes(1);
    // signal 应透传给链，供超时中止生效
    expect(chain.invoke).toHaveBeenCalledWith(
      { question: 'q' },
      { signal: expect.any(AbortSignal) },
    );
  });

  it('should retry failed attempts and succeed within the budget', async () => {
    const chain = makeChain();
    chain.invoke
      .mockRejectedValueOnce(new Error('boom-1'))
      .mockRejectedValueOnce(new Error('boom-2'))
      .mockResolvedValueOnce('ok');

    const result = await invokeChainWithRetry<string>(
      chain,
      {},
      { timeoutMs: 1000, retries: 2, label: '测试调用' },
    );

    expect(result).toBe('ok');
    expect(chain.invoke).toHaveBeenCalledTimes(3);
  });

  it('should throw the last error after exhausting retries', async () => {
    const chain = makeChain();
    chain.invoke.mockRejectedValue(new Error('always-fails'));

    await expect(
      invokeChainWithRetry(
        chain,
        {},
        { timeoutMs: 1000, retries: 2, label: '测试调用' },
      ),
    ).rejects.toThrow('always-fails');
    // 首次 + 2 次重试
    expect(chain.invoke).toHaveBeenCalledTimes(3);
  });

  it('should surface an invocation exceeding the deadline as a timeout error', async () => {
    useFakeTimers();
    const chain = makeChain();
    chain.invoke.mockImplementation(
      () => new Promise(() => {}), // 永不完成，模拟上游挂起
    );

    const pending = invokeChainWithRetry(
      chain,
      {},
      { timeoutMs: 5000, retries: 0, label: '大纲生成' },
    );
    const assertion = expect(pending).rejects.toThrow('大纲生成超时');

    await jest.advanceTimersByTimeAsync(5001);
    await assertion;
  });

  it('should treat a failed validation as a failed attempt and retry', async () => {
    const chain = makeChain();
    chain.invoke
      .mockResolvedValueOnce({ broken: true })
      .mockResolvedValueOnce({ ok: true });

    const result = await invokeChainWithRetry<{ ok: boolean }>(
      chain,
      {},
      {
        timeoutMs: 1000,
        retries: 1,
        label: '测试调用',
        validate: (result) => {
          if (!(result as any)?.ok) {
            throw new Error('AI 返回的结构不完整');
          }
        },
      },
    );

    expect(result).toEqual({ ok: true });
    expect(chain.invoke).toHaveBeenCalledTimes(2);
  });

  it('should report an aborted chain invocation as a timeout error', async () => {
    useFakeTimers();
    const chain = makeChain();
    chain.invoke.mockImplementation(
      async (_input: unknown, options?: { signal?: AbortSignal }) => {
        // 模拟链内部对中止信号的反应：被 abort 后抛错
        return new Promise((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () =>
            reject(new Error('aborted')),
          );
        });
      },
    );

    const pending = invokeChainWithRetry(
      chain,
      {},
      { timeoutMs: 3000, retries: 0, label: '报告生成' },
    );
    const assertion = expect(pending).rejects.toThrow('报告生成超时');

    await jest.advanceTimersByTimeAsync(3001);
    await assertion;
  });

  it('should work with real langchain runnables', async () => {
    const chain = RunnableLambda.from(
      async (input: { n: number }) => input.n * 2,
    );

    const result = await invokeChainWithRetry<number>(
      chain,
      { n: 21 },
      { timeoutMs: 1000, retries: 0, label: '测试调用' },
    );

    expect(result).toBe(42);
  });
});
