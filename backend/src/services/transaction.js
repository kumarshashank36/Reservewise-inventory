import mongoose from 'mongoose';

const MAX_TRANSACTION_ATTEMPTS = 3;

export async function runTransaction(work) {
  let lastError;
  for (let attempt = 0; attempt < MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
    const session = await mongoose.startSession();
    try {
      let result;
      await session.withTransaction(async () => { result = await work(session); });
      return result;
    } catch (error) {
      lastError = error;
      const transient = error?.hasErrorLabel?.('TransientTransactionError') || error?.hasErrorLabel?.('UnknownTransactionCommitResult');
      if (!transient || attempt === MAX_TRANSACTION_ATTEMPTS - 1) throw error;
    } finally {
      await session.endSession();
    }
  }
  throw lastError;
}
