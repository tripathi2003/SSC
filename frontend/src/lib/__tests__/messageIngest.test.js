jest.mock('../signal/migration', () => ({
  decryptMessageBody: jest.fn(),
}));

jest.mock('../sentPlaintextCache', () => ({
  getSentPlaintext: jest.fn(),
}));

import { decryptMessageBody } from '../signal/migration';
import { getSentPlaintext } from '../sentPlaintextCache';
import {
  buildDecryptedBodiesMap,
  ingestMessagePlaintext,
  retryIngestMessagePlaintext,
} from '../messageIngest';
import { clearMessagePlaintextStore, getReceivedPlaintext } from '../messagePlaintextStore';

describe('messageIngest', () => {
  beforeEach(() => {
    clearMessagePlaintextStore();
    jest.clearAllMocks();
  });

  it('decrypts inbound message once and caches plaintext', async () => {
    decryptMessageBody.mockResolvedValue('hi there');
    const msg = {
      message_id: 'm1',
      sender_id: 'peer',
      ciphertext: 'ct',
      expires_at: '2099-01-01T00:00:00.000Z',
    };
    await ingestMessagePlaintext(msg, { myUserId: 'me', peerUserId: 'peer' });
    expect(getReceivedPlaintext('m1')).toBe('hi there');
    expect(decryptMessageBody).toHaveBeenCalledTimes(1);

    await ingestMessagePlaintext(msg, { myUserId: 'me', peerUserId: 'peer' });
    expect(decryptMessageBody).toHaveBeenCalledTimes(1);
  });

  it('uses sent cache for outbound signal without decrypt', async () => {
    getSentPlaintext.mockReturnValue('my text');
    const msg = {
      message_id: 'm2',
      sender_id: 'me',
      protocol: 'signal_v1',
      ciphertext: 'ct',
    };
    await ingestMessagePlaintext(msg, { myUserId: 'me', peerUserId: 'peer' });
    expect(getReceivedPlaintext('m2')).toBe('my text');
    expect(decryptMessageBody).not.toHaveBeenCalled();
  });

  it('retry clears error and re-ingests', async () => {
    decryptMessageBody
      .mockRejectedValueOnce(new Error('DECRYPT_FAIL'))
      .mockResolvedValueOnce('fixed');
    const msg = { message_id: 'm3', sender_id: 'peer', ciphertext: 'ct' };
    await ingestMessagePlaintext(msg, { myUserId: 'me', peerUserId: 'peer' });
    expect(getReceivedPlaintext('m3')).toBeNull();

    await retryIngestMessagePlaintext(msg, { myUserId: 'me', peerUserId: 'peer' });
    expect(getReceivedPlaintext('m3')).toBe('fixed');
    expect(decryptMessageBody).toHaveBeenCalledTimes(2);
  });

  it('buildDecryptedBodiesMap reads store and sent cache', () => {
    const messages = [
      { message_id: 'a', sender_id: 'peer' },
      { message_id: 'b', sender_id: 'me', ciphertext: 'c' },
    ];
    decryptMessageBody.mockResolvedValue('stored');
    return ingestMessagePlaintext(messages[0], { myUserId: 'me', peerUserId: 'peer' }).then(() => {
      getSentPlaintext.mockReturnValue('out');
      const bodies = buildDecryptedBodiesMap(messages, 'me');
      expect(bodies.a).toBe('stored');
      expect(bodies.b).toBe('out');
    });
  });
});