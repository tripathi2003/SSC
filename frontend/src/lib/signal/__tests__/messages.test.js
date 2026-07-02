jest.mock('../nativeLibsignal', () => ({
  decryptSignalMessage: jest.fn(),
  encryptSignalMessage: jest.fn(),
  hasSignalSession: jest.fn(),
  isNativeLibsignalAvailable: jest.fn(),
}));

jest.mock('../x3dh', () => ({
  ensureSignalSession: jest.fn(),
  forceRefreshSignalSession: jest.fn(),
}));

import { encryptSignalMessage as nativeEncryptSignalMessage } from '../nativeLibsignal';
import { ensureSignalSession, forceRefreshSignalSession } from '../x3dh';
import { encryptSignalText } from '../messages';

describe('encryptSignalText', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ensureSignalSession.mockResolvedValue(undefined);
    forceRefreshSignalSession.mockResolvedValue(undefined);
    nativeEncryptSignalMessage.mockResolvedValue({ ciphertext: 'ct', signal_message_type: 1 });
  });

  it('ensures a Signal session before encrypting', async () => {
    await encryptSignalText('peer-1', 'me-1', 'hello');

    expect(ensureSignalSession).toHaveBeenCalledWith('peer-1', 'me-1', 1);
    expect(nativeEncryptSignalMessage).toHaveBeenCalledWith('peer-1', 'me-1', 'hello', 1);
  });

  it('retries with forceRefreshSignalSession on session-not-found error', async () => {
    const sessionErr = new Error('session with peer-1.1 not found : encrypt_message');
    nativeEncryptSignalMessage
      .mockRejectedValueOnce(sessionErr)
      .mockResolvedValueOnce({ ciphertext: 'ct2', signal_message_type: 1 });

    const result = await encryptSignalText('peer-1', 'me-1', 'hello');

    expect(forceRefreshSignalSession).toHaveBeenCalledWith('peer-1', 'me-1', 1);
    expect(nativeEncryptSignalMessage).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ ciphertext: 'ct2', signal_message_type: 1 });
  });

  it('retries twice before giving up on persistent session-not-found errors', async () => {
    const sessionErr = new Error('session with peer-1.1 not found : encrypt_message');
    nativeEncryptSignalMessage.mockRejectedValue(sessionErr);

    await expect(encryptSignalText('peer-1', 'me-1', 'hello')).rejects.toThrow('encrypt_message');
    expect(forceRefreshSignalSession).toHaveBeenCalledTimes(2);
    expect(nativeEncryptSignalMessage).toHaveBeenCalledTimes(3);
  });

  it('re-throws if error is not session-not-found', async () => {
    const otherErr = new Error('some other native error');
    nativeEncryptSignalMessage.mockRejectedValueOnce(otherErr);

    await expect(encryptSignalText('peer-1', 'me-1', 'hello')).rejects.toThrow('some other native error');
    expect(forceRefreshSignalSession).not.toHaveBeenCalled();
  });
});