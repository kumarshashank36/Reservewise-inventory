import mongoose from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runTransaction } from '../src/services/transaction.js';

function labeledError(label) {
  const error = new Error(`simulated ${label}`);
  error.hasErrorLabel = (candidate) => candidate === label;
  return error;
}

// Fake session whose withTransaction applies the matching outcome per attempt.
function makeSession(outcomes) {
  let attempt = 0;
  return {
    async withTransaction(callback) {
      const outcome = outcomes[attempt];
      attempt += 1;
      await callback();
      if (outcome?.throwAfter) throw outcome.throwAfter;
    },
    async endSession() {}
  };
}

describe('runTransaction', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('retries once when the commit fails with a transient error and returns the final result', async () => {
    vi.spyOn(mongoose, 'startSession').mockResolvedValue(makeSession([{ throwAfter: labeledError('TransientTransactionError') }, {}]));
    const work = vi.fn(async () => 'committed');

    await expect(runTransaction(work)).resolves.toBe('committed');
    expect(work).toHaveBeenCalledTimes(2);
  });

  it('treats unknown commit outcomes as transient and retries them', async () => {
    vi.spyOn(mongoose, 'startSession').mockResolvedValue(makeSession([{ throwAfter: labeledError('UnknownTransactionCommitResult') }, {}]));
    const work = vi.fn(async () => 'committed');

    await expect(runTransaction(work)).resolves.toBe('committed');
    expect(work).toHaveBeenCalledTimes(2);
  });

  it('does not retry non-transient errors', async () => {
    const fatal = new Error('boom');
    vi.spyOn(mongoose, 'startSession').mockResolvedValue(makeSession([{ throwAfter: fatal }]));
    const work = vi.fn(async () => 'never');

    await expect(runTransaction(work)).rejects.toThrow('boom');
    expect(work).toHaveBeenCalledTimes(1);
  });

  it('gives up after three transient attempts and throws the last error', async () => {
    const transient = labeledError('TransientTransactionError');
    vi.spyOn(mongoose, 'startSession').mockResolvedValue(makeSession([
      { throwAfter: transient }, { throwAfter: transient }, { throwAfter: transient }
    ]));
    const work = vi.fn(async () => 'never');

    await expect(runTransaction(work)).rejects.toThrow('simulated TransientTransactionError');
    expect(work).toHaveBeenCalledTimes(3);
  });
});
