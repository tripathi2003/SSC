jest.mock('../../api', () => ({
  api: {
    post: jest.fn(),
  },
}));

jest.mock('../../platform', () => ({
  isInstalledClient: jest.fn(() => true),
}));

jest.mock('../../diagnosticLog', () => ({
  recordDiagnostic: jest.fn(),
}));

jest.mock('../deviceStore', () => ({
  getLocalDeviceId: jest.fn(() => 1),
}));

jest.mock('../multiDeviceMessaging', () => ({
  encryptSignalTextForPeerDevices: jest.fn(),
}));

import { api } from '../../api';
import { encryptSignalTextForPeerDevices } from '../multiDeviceMessaging';
import {
  __resetSealedSenderStateForTests,
  buildSealedInnerPayload,
  getResolvedSenderId,
  markLocalSealedSend,
  parseSealedPlaintext,
  cacheResolvedSender,
  sendSealedDirectMessage,
} from '../sealedSender';

describe('sealedSender', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetSealedSenderStateForTests();
    encryptSignalTextForPeerDevices.mockResolvedValue({
      ciphertext: 'ciphertext',
      signal_message_type: 2,
      signal_device_ciphertexts: { 1: { ciphertext: 'ciphertext', signal_message_type: 2 } },
    });
  });

  it('parses sealed inner payload', () => {
    const inner = buildSealedInnerPayload({
      senderUserId: 'u_a',
      senderDeviceId: 1,
      body: { text: 'hello' },
    });
    const parsed = parseSealedPlaintext(JSON.stringify(inner));
    expect(parsed.sender_user_id).toBe('u_a');
    expect(parsed.body.text).toBe('hello');
  });

  it('resolves sender from cache and local sealed sends', () => {
    cacheResolvedSender('m1', 'u_peer');
    markLocalSealedSend('m2');
    expect(getResolvedSenderId({ message_id: 'm1' }, 'u_me')).toBe('u_peer');
    expect(getResolvedSenderId({ message_id: 'm2', sealed_sender: true }, 'u_me')).toBe('u_me');
  });

  it('sendSealedDirectMessage mints token and posts without auth', async () => {
    api.post
      .mockResolvedValueOnce({ data: { token: 'tok', expires_in_sec: 120 } })
      .mockResolvedValueOnce({ data: { message_id: 'm_new', sealed_sender: true } });

    const result = await sendSealedDirectMessage({
      conversationId: 'conv-1',
      peerUserId: 'u_b',
      ourUserId: 'u_a',
      bodyFields: { text: 'hi' },
    });

    expect(result.message_id).toBe('m_new');
    expect(api.post).toHaveBeenNthCalledWith(
      1,
      '/messages/sealed-token',
      { conversation_id: 'conv-1' },
    );
    expect(api.post).toHaveBeenNthCalledWith(
      2,
      '/messages/sealed',
      expect.objectContaining({
        delivery_token: 'tok',
        conversation_id: 'conv-1',
        protocol: 'signal_v1',
      }),
      { skipAuth: true },
    );
  });

  it('sendSealedDirectMessage throws when token mint fails (triggers fallback in caller)', async () => {
    api.post.mockRejectedValueOnce(new Error('Network error'));

    await expect(
      sendSealedDirectMessage({
        conversationId: 'conv-1',
        peerUserId: 'u_b',
        ourUserId: 'u_a',
        bodyFields: { text: 'hi' },
      }),
    ).rejects.toThrow('Network error');
  });

  it('sendSealedDirectMessage throws when post sealed fails (triggers fallback in caller)', async () => {
    api.post
      .mockResolvedValueOnce({ data: { token: 'tok', expires_in_sec: 120 } })
      .mockRejectedValueOnce({ response: { status: 401, data: { detail: 'Invalid or expired delivery token' } } });

    await expect(
      sendSealedDirectMessage({
        conversationId: 'conv-1',
        peerUserId: 'u_b',
        ourUserId: 'u_a',
        bodyFields: { text: 'hi' },
      }),
    ).rejects.toBeDefined();
  });
});