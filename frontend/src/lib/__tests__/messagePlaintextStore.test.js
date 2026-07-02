import {
  cacheReceivedPlaintext,
  clearMessagePlaintextStore,
  getMessagePlaintextEntry,
  getReceivedPlaintext,
  isDuplicateDecryptError,
  purgeExpiredPlaintextEntries,
  setMessagePlaintextError,
  subscribeMessagePlaintext,
} from '../messagePlaintextStore';

describe('messagePlaintextStore', () => {
  beforeEach(() => {
    clearMessagePlaintextStore();
  });

  it('stores plaintext and notifies subscribers', () => {
    const seen = [];
    subscribeMessagePlaintext((id) => seen.push(id));
    cacheReceivedPlaintext('m1', 'hello', '2099-01-01T00:00:00.000Z');
    expect(getReceivedPlaintext('m1')).toBe('hello');
    expect(seen).toContain('m1');
  });

  it('does not overwrite success with error', () => {
    cacheReceivedPlaintext('m1', 'hello');
    setMessagePlaintextError('m1', 'DECRYPT_FAIL');
    expect(getReceivedPlaintext('m1')).toBe('hello');
  });

  it('purges expired entries', () => {
    cacheReceivedPlaintext('m1', 'gone', '2000-01-01T00:00:00.000Z');
    purgeExpiredPlaintextEntries();
    expect(getMessagePlaintextEntry('m1')).toBeNull();
  });

  it('detects duplicate decrypt errors from libsignal', () => {
    expect(isDuplicateDecryptError(new Error('DuplicateMessageException'))).toBe(true);
    expect(isDuplicateDecryptError(new Error('other'))).toBe(false);
  });
});