import { resolveSignalCiphertextForDevice, decryptSignalTextForLocalDevice } from '../multiDeviceMessaging';

jest.mock('../deviceStore', () => ({ getLocalDeviceId: () => 2 }));
jest.mock('../messages', () => ({
  decryptSignalText: jest.fn().mockResolvedValue('hello'),
  isSignalV1Message: (msg) => msg?.protocol === 'signal_v1',
}));

describe('multiDeviceMessaging', () => {
  it('picks per-device ciphertext when present', () => {
    const msg = {
      protocol: 'signal_v1',
      ciphertext: 'legacy',
      signal_message_type: 1,
      signal_device_ciphertexts: {
        2: { ciphertext: 'dev2', signal_message_type: 3 },
      },
    };
    expect(resolveSignalCiphertextForDevice(msg, 2)).toEqual({
      ciphertext: 'dev2',
      signal_message_type: 3,
    });
    expect(resolveSignalCiphertextForDevice(msg, 1).ciphertext).toBe('legacy');
  });

  it('decryptSignalTextForLocalDevice uses sender_device_id as peerDeviceId', async () => {
    const { decryptSignalText } = require('../messages');
    decryptSignalText.mockClear();

    const msg = {
      protocol: 'signal_v1',
      ciphertext: 'legacy',
      signal_message_type: 1,
      sender_device_id: 1,
      signal_device_ciphertexts: {
        2: { ciphertext: 'dev2ct', signal_message_type: 3 },
      },
    };

    await decryptSignalTextForLocalDevice(msg, 'peerA', 'ourUser');

    expect(decryptSignalText).toHaveBeenCalledTimes(1);
    const [peerUserId, ourUserId, merged, peerDeviceId] = decryptSignalText.mock.calls[0];
    expect(peerUserId).toBe('peerA');
    expect(ourUserId).toBe('ourUser');
    expect(merged.ciphertext).toBe('dev2ct');
    expect(merged.signal_message_type).toBe(3);
    // Critical: peerDeviceId must be sender's device (1), NOT our local device (2)
    expect(peerDeviceId).toBe(1);
  });

  it('decryptSignalTextForLocalDevice defaults peerDeviceId to 1 when sender_device_id absent', async () => {
    const { decryptSignalText } = require('../messages');
    decryptSignalText.mockClear();

    const msg = {
      protocol: 'signal_v1',
      ciphertext: 'legacy',
      signal_message_type: 1,
      signal_device_ciphertexts: {
        2: { ciphertext: 'dev2ct', signal_message_type: 3 },
      },
    };

    await decryptSignalTextForLocalDevice(msg, 'peerB', 'ourUser');

    const [, , , peerDeviceId] = decryptSignalText.mock.calls[0];
    expect(peerDeviceId).toBe(1);
  });
});