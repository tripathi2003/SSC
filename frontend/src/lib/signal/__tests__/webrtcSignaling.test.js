jest.mock('../installedMessaging', () => ({
  usesSignalOnlyMessaging: jest.fn(),
}));

jest.mock('../nativeLibsignal', () => ({
  isNativeLibsignalAvailable: jest.fn(),
}));

jest.mock('../x3dh', () => ({
  ensureSignalSession: jest.fn(),
}));

jest.mock('../messages', () => ({
  canUseSignalMessaging: jest.fn(),
  encryptSignalText: jest.fn(),
  decryptSignalText: jest.fn(),
}));

jest.mock('../groupMessages', () => ({
  canUseSignalGroupMessaging: jest.fn(),
  ensureGroupSenderKeysDistributed: jest.fn(),
  encryptGroupText: jest.fn(),
  decryptGroupText: jest.fn(),
}));

import { usesSignalOnlyMessaging } from '../installedMessaging';
import { isNativeLibsignalAvailable } from '../nativeLibsignal';
import { ensureSignalSession } from '../x3dh';
import { canUseSignalMessaging, encryptSignalText, decryptSignalText } from '../messages';
import {
  canUseSignalGroupMessaging,
  ensureGroupSenderKeysDistributed,
  encryptGroupText,
  decryptGroupText,
} from '../groupMessages';
import {
  SignalingFailureReason,
  SignalingNotReadyError,
  SignalingProtocol,
  packOutgoingSignaling,
  unpackIncomingSignaling,
  signalingErrorI18nKey,
} from '../webrtcSignaling';

const user = { user_id: 'me', signal_prekeys_ready: true };
const peer = { user_id: 'peer', signal_prekeys_ready: true };
const members = [peer, { user_id: 'other', signal_prekeys_ready: true }];
const conversationId = 'conv-1';
const offer = { type: 'call-offer', to: 'peer', mode: 'audio', sdp: { type: 'offer', sdp: 'v=0' } };
const groupOffer = {
  ...offer,
  group: true,
  members: members.map((m) => m.user_id),
  conversation_id: conversationId,
  renegotiate: true,
  ice_restart: true,
};

describe('webrtcSignaling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    isNativeLibsignalAvailable.mockReturnValue(true);
    ensureSignalSession.mockResolvedValue(undefined);
    canUseSignalMessaging.mockResolvedValue(true);
    canUseSignalGroupMessaging.mockReturnValue(true);
    ensureGroupSenderKeysDistributed.mockResolvedValue(undefined);
    encryptSignalText.mockResolvedValue({
      ciphertext: 'ct',
      signal_message_type: 1,
    });
    encryptGroupText.mockResolvedValue({
      ciphertext: 'gct',
      signal_message_type: 7,
      distribution_id: 'dist-1',
    });
  });

  it('maps signaling errors to i18n keys', () => {
    expect(signalingErrorI18nKey(SignalingFailureReason.ENCRYPT_FAILED)).toBe('callSignalingEncryptFailed');
    expect(signalingErrorI18nKey(SignalingFailureReason.PEER_PREKEYS_NOT_READY)).toBe('encryptionErrPeerPrekeys');
  });

  it('throws on installed client when session establish fails', async () => {
    usesSignalOnlyMessaging.mockReturnValue(true);
    ensureSignalSession.mockRejectedValue(new Error('session boom'));

    await expect(
      packOutgoingSignaling(offer, {
        peerUserId: peer.user_id,
        ourUserId: user.user_id,
        peer,
        user,
      }),
    ).rejects.toBeInstanceOf(SignalingNotReadyError);
  });

  it('throws on installed client when encrypt fails — no cleartext fallback', async () => {
    usesSignalOnlyMessaging.mockReturnValue(true);
    encryptSignalText.mockRejectedValue(new Error('encrypt boom'));

    await expect(
      packOutgoingSignaling(offer, {
        peerUserId: peer.user_id,
        ourUserId: user.user_id,
        peer,
        user,
      }),
    ).rejects.toMatchObject({ reason: SignalingFailureReason.ENCRYPT_FAILED });
  });

  it('falls back to legacy cleartext on web when encrypt is not required', async () => {
    usesSignalOnlyMessaging.mockReturnValue(false);
    isNativeLibsignalAvailable.mockReturnValue(false);

    const packed = await packOutgoingSignaling(offer, {
      peerUserId: peer.user_id,
      ourUserId: user.user_id,
      peer,
      user,
    });

    expect(packed.signaling_protocol).toBe(SignalingProtocol.LEGACY_CLEARTEXT);
    expect(packed.sdp).toEqual(offer.sdp);
    expect(encryptSignalText).not.toHaveBeenCalled();
  });

  it('encrypts signaling on installed client when ready', async () => {
    usesSignalOnlyMessaging.mockReturnValue(true);

    const packed = await packOutgoingSignaling(offer, {
      peerUserId: peer.user_id,
      ourUserId: user.user_id,
      peer,
      user,
    });

    expect(packed.signaling_protocol).toBe(SignalingProtocol.SIGNAL_V1);
    expect(packed.signaling_ciphertext).toBe('ct');
    expect(packed.sdp).toBeUndefined();
  });

  it('throws GROUP_NOT_READY for group calls when sender keys are not ready — no legacy fallback', async () => {
    usesSignalOnlyMessaging.mockReturnValue(false);
    canUseSignalGroupMessaging.mockReturnValue(false);

    await expect(
      packOutgoingSignaling(groupOffer, {
        peerUserId: peer.user_id,
        ourUserId: user.user_id,
        peer,
        user,
        isGroup: true,
        members,
        conversationId,
      }),
    ).rejects.toMatchObject({ reason: SignalingFailureReason.GROUP_NOT_READY });
    expect(encryptGroupText).not.toHaveBeenCalled();
  });

  it('encrypts group signaling when sender keys are ready', async () => {
    usesSignalOnlyMessaging.mockReturnValue(false);

    const packed = await packOutgoingSignaling(groupOffer, {
      peerUserId: peer.user_id,
      ourUserId: user.user_id,
      peer,
      user,
      isGroup: true,
      members,
      conversationId,
    });

    expect(packed.signaling_protocol).toBe(SignalingProtocol.SIGNAL_V1);
    expect(packed.group).toBe(true);
    expect(packed.signaling_ciphertext).toBe('gct');
    expect(packed.distribution_id).toBe('dist-1');
    expect(packed.renegotiate).toBe(true);
    expect(packed.ice_restart).toBe(true);
    expect(packed.conversation_id).toBe(conversationId);
    expect(packed.sdp).toBeUndefined();
    expect(ensureGroupSenderKeysDistributed).toHaveBeenCalled();
  });

  it('throws on group encrypt failure — no cleartext fallback on web', async () => {
    usesSignalOnlyMessaging.mockReturnValue(false);
    encryptGroupText.mockRejectedValue(new Error('group encrypt boom'));

    await expect(
      packOutgoingSignaling(groupOffer, {
        peerUserId: peer.user_id,
        ourUserId: user.user_id,
        peer,
        user,
        isGroup: true,
        members,
        conversationId,
      }),
    ).rejects.toMatchObject({ reason: SignalingFailureReason.ENCRYPT_FAILED });
  });

  it('unpackIncomingSignaling decrypts group signal_v1 call-offer', async () => {
    decryptGroupText.mockResolvedValue(JSON.stringify({ sdp: { type: 'offer', sdp: 'v=0' } }));

    const incoming = {
      type: 'call-offer',
      from: 'sender1',
      group: true,
      signaling_protocol: SignalingProtocol.SIGNAL_V1,
      signaling_ciphertext: 'gct',
      signal_message_type: 7,
      distribution_id: 'dist-1',
    };

    const result = await unpackIncomingSignaling(incoming, { myUserId: 'me', peerUserId: 'sender1' });

    expect(result.sdp).toEqual({ type: 'offer', sdp: 'v=0' });
    expect(decryptGroupText).toHaveBeenCalledWith('sender1', expect.objectContaining({
      ciphertext: 'gct',
      signal_message_type: 7,
      sender_id: 'sender1',
    }));
  });

  it('unpackIncomingSignaling decrypts group signal_v1 ice-candidate', async () => {
    decryptGroupText.mockResolvedValue(JSON.stringify({ candidate: { candidate: 'c1', sdpMid: '0' } }));

    const incoming = {
      type: 'ice-candidate',
      from: 'sender2',
      group: true,
      signaling_protocol: SignalingProtocol.SIGNAL_V1,
      signaling_ciphertext: 'gct2',
      signal_message_type: 7,
      distribution_id: 'dist-2',
    };

    const result = await unpackIncomingSignaling(incoming, { myUserId: 'me', peerUserId: 'sender2' });

    expect(result.candidate).toEqual({ candidate: 'c1', sdpMid: '0' });
    expect(decryptGroupText).toHaveBeenCalledWith('sender2', expect.objectContaining({
      ciphertext: 'gct2',
      signal_message_type: 7,
    }));
  });
});