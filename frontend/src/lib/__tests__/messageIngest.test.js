jest.mock('../signal/migration', () => ({
  decryptMessageBody: jest.fn(),
}));

jest.mock('../sentPlaintextCache', () => ({
  getSentPlaintext: jest.fn(),
}));

jest.mock('../signal/x3dh', () => ({
  ensureSignalSession: jest.fn().mockResolvedValue({}),
}));

jest.mock('../signal/sealedSender', () => ({
  getResolvedSenderId: jest.fn((msg, myUserId) => msg?.sender_id ?? null),
}));

import { decryptMessageBody } from '../signal/migration';
import { getSentPlaintext } from '../sentPlaintextCache';
import {
  buildDecryptedBodiesMap,
  conversationPeerFromList,
  ingestMessagePlaintext,
  resolveIngestPeerUserId,
  retryIngestMessagePlaintext,
} from '../messageIngest';
import {
  clearMessagePlaintextStore,
  getMessagePlaintextEntry,
  getReceivedPlaintext,
} from '../messagePlaintextStore';

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

  it('resolveIngestPeerUserId uses conversation peer for sealed inbound', () => {
    const msg = { sender_id: null, sealed_sender: true };
    expect(resolveIngestPeerUserId(msg, { myUserId: 'me', conversationPeerUserId: 'dots' })).toBe('dots');
    expect(resolveIngestPeerUserId(msg, { myUserId: 'me', conversationPeerUserId: null })).toBeNull();
  });

  it('resolveIngestPeerUserId does not treat null sender as peer id', () => {
    const msg = { sender_id: null, sealed_sender: true };
    const wrong = msg.sender_id !== 'me' ? msg.sender_id : 'dots';
    expect(wrong).toBeNull();
    expect(resolveIngestPeerUserId(msg, { myUserId: 'me', conversationPeerUserId: 'dots' })).toBe('dots');
  });

  it('conversationPeerFromList finds DM peer', () => {
    const convs = [{ conversation_id: 'c1', is_group: false, peer: { user_id: 'u_dots' } }];
    expect(conversationPeerFromList('c1', convs)).toBe('u_dots');
    expect(conversationPeerFromList('c_missing', convs)).toBeNull();
  });

  it('does not latch NO_KEY when peerUserId is missing', async () => {
    decryptMessageBody.mockRejectedValue(new Error('NO_KEY'));
    const msg = { message_id: 'm4', sender_id: null, sealed_sender: true, ciphertext: 'ct' };
    await ingestMessagePlaintext(msg, { myUserId: 'me', peerUserId: null });
    expect(getReceivedPlaintext('m4')).toBeNull();
    expect(getMessagePlaintextEntry('m4')).toBeNull();

    decryptMessageBody.mockResolvedValue('hello sealed');
    await ingestMessagePlaintext(msg, { myUserId: 'me', peerUserId: 'dots' });
    expect(getReceivedPlaintext('m4')).toBe('hello sealed');
    expect(decryptMessageBody).toHaveBeenCalledTimes(2);
  });

  it('buildDecryptedBodiesMap reads store and sent cache', () => {
    const messages = [
      { message_id: 'a', sender_id: 'peer' },
      { message_id: 'b', sender_id: 'me', protocol: 'signal_v1', ciphertext: 'c' },
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