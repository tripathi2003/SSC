import {
  cacheReceivedPlaintext,
  clearReceivedPlaintextCache,
  getReceivedPlaintext,
  isDuplicateDecryptError,
} from '../receivedPlaintextCache';

describe('receivedPlaintextCache', () => {
  beforeEach(() => {
    clearReceivedPlaintextCache();
  });

  it('stores and returns decrypted plaintext by message id', () => {
    cacheReceivedPlaintext('m1', 'hello');
    expect(getReceivedPlaintext('m1')).toBe('hello');
    expect(getReceivedPlaintext('m2')).toBeNull();
  });

  it('detects duplicate decrypt errors from libsignal', () => {
    expect(isDuplicateDecryptError(new Error('DuplicateMessageException'))).toBe(true);
    expect(isDuplicateDecryptError(new Error('duplicate message'))).toBe(true);
    expect(isDuplicateDecryptError(new Error('session not found'))).toBe(false);
  });
});