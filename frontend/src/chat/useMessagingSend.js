import { useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { api } from '../lib/api';
import { encryptBytesForRecipients, encryptMessageForRecipients, b64ToBytes } from '../lib/crypto';
import { evaluateMessagingGate } from './messagingGate';
import { toastEncryptFailure, toastMessagingGateFailure } from './messagingErrors';
import { usesSignalOnlyMessaging } from '../lib/signal/installedMessaging';
import { maySendLegacyRsa } from '../lib/signal/legacyRsaPolicy';
import { encryptAttachmentBytes, encryptSignalAttachment } from '../lib/signal/attachments';
import { ensureGroupSenderKeysDistributed, encryptGroupText } from '../lib/signal/groupMessages';
import { encryptSignalText } from '../lib/signal/messages';
import { ProtocolVersion } from '../lib/signal/constants';
import {
  MIN_VOICE_BLOB_BYTES,
  startVoiceRecording,
  voiceFilenameForMime,
} from '../lib/voiceRecorder';
import {
  MAX_VIDEO_ATTACH_BYTES,
  MIN_VIDEO_BLOB_BYTES,
  resolveAttachmentMessageType,
  startVideoRecording,
  videoFilenameForMime,
} from '../lib/videoRecorder';
import { stickerToPngBlob } from '../lib/stickerPack';
import { fetchGifBlob } from '../lib/gifSearch';
import { ensureMediaPermissions } from '../lib/mediaPermissions';
import { isPeerBlocked } from '../lib/contactFilters';
import { resolveMentionedUserIds } from '../lib/groupMentions';
import {
  buildPollPayload,
  serializePollPayload,
} from '../lib/pollMessage';
import {
  buildLocationPayload,
  serializeLocationPayload,
} from '../lib/locationMessage';
import { captureCurrentLocation } from '../lib/locationShare';
import { canPostInGroup } from '../lib/groupRoles';
import { sealedSenderEnabled, sendSealedDirectMessage } from '../lib/signal/sealedSender';

export function useMessagingSend({
  activeConv,
  activeId,
  isGroup,
  peer,
  user,
  privateKey,
  myContacts,
  canMessagePeer,
  isRequestPendingPeer,
  recipientsForActive,
  refreshUser,
  setDraft,
  setUploadBusy,
  uploadBusy,
  replyTo,
  setReplyTo,
  activeTopicId,
  t,
}) {
  const voiceRecordingRef = useRef(null);
  const videoRecordingRef = useRef(null);
  const onVideoRecordingEndRef = useRef(null);

  const runMessagingGate = useCallback(async () => {
    const gate = await evaluateMessagingGate({
      isGroup,
      peer,
      user,
      members: activeConv?.members || [],
      refreshUser,
    });
    if (usesSignalOnlyMessaging() && !gate.ok) {
      toastMessagingGateFailure(gate, t);
      return null;
    }
    if (!usesSignalOnlyMessaging() && !privateKey && !gate.ok) {
      toast.error(t('encryptionNotReady'));
      return null;
    }
    return gate;
  }, [activeConv, isGroup, peer, user, privateKey, refreshUser, t]);

  const uploadEncryptedAttachment = useCallback(async (blob, filename, mimeType) => {
    const raw = await blob.arrayBuffer();
    const gate = await runMessagingGate();
    if (!gate) throw new Error('encryption_not_ready');
    const useSignal = gate.useSignal;

    let enc;
    if (useSignal) {
      enc = await encryptAttachmentBytes(raw);
    } else {
      const recipients = recipientsForActive;
      if (Object.keys(recipients).length < 2) {
        throw new Error('No recipients have encryption keys yet');
      }
      enc = await encryptBytesForRecipients(raw, recipients);
    }

    const cipherBlob = new Blob([b64ToBytes(enc.ciphertext)], { type: 'application/octet-stream' });
    const form = new FormData();
    form.append('file', cipherBlob, `${filename}.enc`);
    form.append('encrypted', 'true');
    if (mimeType) form.append('original_content_type', mimeType);
    const { data } = await api.post('/files/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } });
    const contentType = mimeType || 'application/octet-stream';

    if (useSignal) {
      return {
        fileId: data.file_id,
        attachmentEnc: {
          content_type: contentType,
          signal_meta: {
            file_id: data.file_id,
            iv: enc.iv,
            key: enc.key,
            content_type: contentType,
            caption: filename,
          },
        },
      };
    }

    return {
      fileId: data.file_id,
      attachmentEnc: {
        iv: enc.iv,
        encrypted_keys: enc.encrypted_keys,
        content_type: contentType,
      },
    };
  }, [recipientsForActive, runMessagingGate]);

  const sendMessage = useCallback(async (text, type = 'text', attachmentId = null, attachmentEnc = null, opts = {}) => {
    const { pollOptionCount } = opts;
    const pollPayload = pollOptionCount ? { poll_option_count: pollOptionCount } : {};
    const topicPayload = isGroup && activeTopicId ? { topic_id: activeTopicId } : {};
    const replyToMessageId = replyTo?.message_id || null;
    const mentionedUserIds = isGroup && text && type === 'text'
      ? resolveMentionedUserIds(text, activeConv?.members || [])
      : [];
    const mentionPayload = mentionedUserIds.length ? { mentioned_user_ids: mentionedUserIds } : {};
    if (!activeConv) return;
    if (!text && !attachmentId) return;
    if (isGroup && !canPostInGroup(activeConv, user?.user_id)) {
      toast.error(t('groupPostingRestricted'));
      return;
    }
    if (!isGroup && peer && isPeerBlocked(peer.user_id, myContacts)) {
      toast.error(t('cannotMessageBlocked'));
      return;
    }
    if (!canMessagePeer) {
      toast.info(isRequestPendingPeer ? t('requestPendingChat') : t('cannotMessageNonMutual'));
      return;
    }
    try {
      const gate = await runMessagingGate();
      if (!gate) return;
      const useSignal = gate.useSignal;

      if (useSignal && isGroup) {
        await ensureGroupSenderKeysDistributed({
          conversationId: activeId,
          members: activeConv.members || [],
          ourUserId: user.user_id,
        });
        let enc;
        if (attachmentId && attachmentEnc?.signal_meta) {
          const { buildSignalAttachmentEnvelope } = await import('../lib/signal/attachments');
          enc = await encryptGroupText(
            activeId,
            user.user_id,
            buildSignalAttachmentEnvelope(attachmentEnc.signal_meta),
          );
        } else {
          enc = await encryptGroupText(activeId, user.user_id, text || '');
        }
        await api.post('/messages', {
          conversation_id: activeId,
          protocol: ProtocolVersion.SIGNAL_GROUP_V1,
          ciphertext: enc.ciphertext,
          signal_message_type: enc.signal_message_type,
          distribution_id: enc.distribution_id,
          message_type: type,
          attachment_id: attachmentId || undefined,
          attachment_content_type: attachmentEnc?.content_type,
          reply_to_message_id: replyToMessageId || undefined,
          ...mentionPayload,
          ...pollPayload,
          ...topicPayload,
        });
        setDraft('');
        setReplyTo?.(null);
        return;
      }

      if (useSignal && !isGroup) {
        if (sealedSenderEnabled(user)) {
          let bodyFields;
          if (attachmentId && attachmentEnc?.signal_meta) {
            const { buildSignalAttachmentEnvelope } = await import('../lib/signal/attachments');
            bodyFields = {
              attachment_envelope: buildSignalAttachmentEnvelope(attachmentEnc.signal_meta),
            };
          } else {
            bodyFields = { text: text || '' };
          }
          await sendSealedDirectMessage({
            conversationId: activeId,
            peerUserId: peer.user_id,
            ourUserId: user.user_id,
            bodyFields,
            messageType: type,
            attachmentId: attachmentId || undefined,
            attachmentContentType: attachmentEnc?.content_type,
            replyToMessageId: replyToMessageId || undefined,
          });
        } else {
          let enc;
          if (attachmentId && attachmentEnc?.signal_meta) {
            enc = await encryptSignalAttachment(peer.user_id, user.user_id, attachmentEnc.signal_meta);
          } else {
            const { encryptSignalTextForPeerDevices } = await import('../lib/signal/multiDeviceMessaging');
            enc = await encryptSignalTextForPeerDevices(peer.user_id, user.user_id, text || '');
          }
          await api.post('/messages', {
            conversation_id: activeId,
            protocol: ProtocolVersion.SIGNAL_V1,
            ciphertext: enc.ciphertext,
            signal_message_type: enc.signal_message_type,
            signal_device_ciphertexts: enc.signal_device_ciphertexts,
            message_type: type,
            attachment_id: attachmentId || undefined,
            attachment_content_type: attachmentEnc?.content_type,
            reply_to_message_id: replyToMessageId || undefined,
          });
        }
        setDraft('');
        setReplyTo?.(null);
        return;
      }

      if (!maySendLegacyRsa()) {
        toast.error(t('encryptionNotReady'));
        return;
      }
      if (!privateKey) {
        toast.error(t('encryptionNotReady'));
        return;
      }
      const recipients = recipientsForActive;
      if (Object.keys(recipients).length < 2) {
        toast.error('No recipients have encryption keys yet');
        return;
      }
      const enc = await encryptMessageForRecipients(text || '', recipients);
      await api.post('/messages', {
        conversation_id: activeId,
        protocol: ProtocolVersion.LEGACY_RSA,
        ciphertext: enc.ciphertext, iv: enc.iv, encrypted_keys: enc.encrypted_keys,
        message_type: type, attachment_id: attachmentId,
        attachment_iv: attachmentEnc?.iv,
        attachment_encrypted_keys: attachmentEnc?.encrypted_keys,
        attachment_content_type: attachmentEnc?.content_type,
        reply_to_message_id: replyToMessageId || undefined,
        ...mentionPayload,
        ...pollPayload,
        ...topicPayload,
      });
      setDraft('');
      setReplyTo?.(null);
    } catch (e) {
      if (usesSignalOnlyMessaging()) {
        toastEncryptFailure(e, t);
      } else {
        const detail = e?.response?.data?.detail;
        toast.error(detail || t('sendFailed'));
      }
    }
  }, [
    activeConv, activeId, activeTopicId, isGroup, peer, user, privateKey, myContacts,
    canMessagePeer, isRequestPendingPeer, recipientsForActive, runMessagingGate, setDraft, replyTo, setReplyTo, t,
  ]);

  const sendPoll = useCallback(async ({ question, options }) => {
    if (!isGroup) {
      toast.error(t('pollGroupsOnly'));
      return;
    }
    const built = buildPollPayload({ question, options });
    if (!built.ok) {
      toast.error(t(built.errorKey));
      return;
    }
    const text = serializePollPayload(built.payload);
    await sendMessage(text, 'poll', null, null, {
      pollOptionCount: built.payload.options.length,
    });
  }, [isGroup, sendMessage, t]);

  const sendLocation = useCallback(async () => {
    if (!activeConv || uploadBusy) return;
    if (!canMessagePeer) {
      toast.info(isRequestPendingPeer ? t('requestPendingChat') : t('cannotMessageNonMutual'));
      return;
    }
    setUploadBusy(true);
    try {
      const captured = await captureCurrentLocation();
      if (!captured.ok) {
        toast.error(t(captured.errorKey));
        return;
      }
      const built = buildLocationPayload(captured.coords);
      if (!built.ok) {
        toast.error(t(built.errorKey));
        return;
      }
      await sendMessage(serializeLocationPayload(built.payload), 'location');
    } finally {
      setUploadBusy(false);
    }
  }, [
    activeConv,
    uploadBusy,
    canMessagePeer,
    isRequestPendingPeer,
    sendMessage,
    setUploadBusy,
    t,
  ]);

  const editMessage = useCallback(async (originalMsg, newText) => {
    if (!activeConv || !originalMsg?.message_id || !newText?.trim()) return null;
    if (!canMessagePeer) {
      toast.info(isRequestPendingPeer ? t('requestPendingChat') : t('cannotMessageNonMutual'));
      return null;
    }
    const protocol = originalMsg.protocol || ProtocolVersion.LEGACY_RSA;
    try {
      const gate = await runMessagingGate();
      if (!gate) return null;

      if (protocol === ProtocolVersion.SIGNAL_GROUP_V1) {
        await ensureGroupSenderKeysDistributed({
          conversationId: activeId,
          members: activeConv.members || [],
          ourUserId: user.user_id,
        });
        const enc = await encryptGroupText(activeId, user.user_id, newText.trim());
        const { data } = await api.post('/messages/edit', {
          conversation_id: activeId,
          message_id: originalMsg.message_id,
          protocol: ProtocolVersion.SIGNAL_GROUP_V1,
          ciphertext: enc.ciphertext,
          signal_message_type: enc.signal_message_type,
          distribution_id: enc.distribution_id,
        });
        return data;
      }

      if (protocol === ProtocolVersion.SIGNAL_V1) {
        const enc = await encryptSignalText(peer.user_id, user.user_id, newText.trim());
        const { data } = await api.post('/messages/edit', {
          conversation_id: activeId,
          message_id: originalMsg.message_id,
          protocol: ProtocolVersion.SIGNAL_V1,
          ciphertext: enc.ciphertext,
          signal_message_type: enc.signal_message_type,
        });
        return data;
      }

      if (!maySendLegacyRsa() || !privateKey) {
        toast.error(t('encryptionNotReady'));
        return null;
      }
      const recipients = recipientsForActive;
      if (Object.keys(recipients).length < 2) {
        toast.error('No recipients have encryption keys yet');
        return null;
      }
      const enc = await encryptMessageForRecipients(newText.trim(), recipients);
      const { data } = await api.post('/messages/edit', {
        conversation_id: activeId,
        message_id: originalMsg.message_id,
        protocol: ProtocolVersion.LEGACY_RSA,
        ciphertext: enc.ciphertext,
        iv: enc.iv,
        encrypted_keys: enc.encrypted_keys,
      });
      return data;
    } catch (e) {
      if (usesSignalOnlyMessaging()) {
        toastEncryptFailure(e, t);
      } else {
        const detail = e?.response?.data?.detail;
        toast.error(detail || t('messageEditFailed'));
      }
      return null;
    }
  }, [
    activeConv, activeId, peer, user, privateKey, canMessagePeer, isRequestPendingPeer,
    recipientsForActive, runMessagingGate, t,
  ]);

  const sendMediaAttachment = useCallback(async (blob, messageType, mimeType, filename) => {
    if (!blob || !activeConv || uploadBusy) return;
    const gate = await runMessagingGate();
    if (!gate) return;
    setUploadBusy(true);
    try {
      const { fileId, attachmentEnc } = await uploadEncryptedAttachment(blob, filename, mimeType);
      await sendMessage('', messageType, fileId, attachmentEnc);
    } catch {
      if (messageType === 'sticker') toast.error(t('stickerSendFailed'));
      else if (messageType === 'gif') toast.error(t('gifSendFailed'));
      else toast.error(t('uploadFailed'));
    } finally {
      setUploadBusy(false);
    }
  }, [activeConv, uploadBusy, runMessagingGate, sendMessage, setUploadBusy, t, uploadEncryptedAttachment]);

  const sendBundledSticker = useCallback(async (sticker) => {
    if (!sticker) return;
    try {
      const blob = await stickerToPngBlob(sticker);
      await sendMediaAttachment(blob, 'sticker', 'image/png', `sticker-${sticker.id}.png`);
    } catch {
      toast.error(t('stickerSendFailed'));
    }
  }, [sendMediaAttachment, t]);

  const sendRemoteGif = useCallback(async (gif) => {
    if (!gif?.gifUrl) return;
    try {
      const blob = await fetchGifBlob(gif.gifUrl);
      const mime = blob.type || 'image/gif';
      await sendMediaAttachment(blob, 'gif', mime, 'gif.gif');
    } catch {
      toast.error(t('gifSendFailed'));
    }
  }, [sendMediaAttachment, t]);

  const attachFile = useCallback(async (file, { fromPaste = false } = {}) => {
    if (!file || !activeConv || uploadBusy) return;
    if (file.size > MAX_VIDEO_ATTACH_BYTES) {
      toast.error(t('fileTooLarge'));
      return;
    }
    const gate = await runMessagingGate();
    if (!gate) return;
    setUploadBusy(true);
    try {
      const type = resolveAttachmentMessageType(file.type);
      const mime = file.type || (type === 'image' ? 'image/png' : type === 'video' ? 'video/webm' : 'application/octet-stream');
      const name = file.name || (type === 'image' ? 'screenshot.png' : type === 'video' ? 'video.webm' : 'attachment');
      const { fileId, attachmentEnc } = await uploadEncryptedAttachment(file, name, mime);
      await sendMessage(name, type, fileId, attachmentEnc);
      if (fromPaste && type === 'image') {
        toast.success(t('pasteImageAttached'));
      }
    } catch (err) {
      const status = err?.response?.status;
      if (status === 413) toast.error(t('fileTooLarge'));
      else if (err?.message?.includes('encryption keys')) toast.error(err.message);
      else if (err?.message === 'encryption_not_ready') { /* gate already toasted */ }
      else toast.error(err?.response?.data?.detail || t('uploadFailed'));
    } finally {
      setUploadBusy(false);
    }
  }, [activeConv, uploadBusy, runMessagingGate, sendMessage, setUploadBusy, t, uploadEncryptedAttachment]);

  const finishVoiceRecording = useCallback(async (session) => {
    if (!session) return;
    session.stop();
    try {
      const { blob, mimeType } = await session.done;
      if (blob.size < MIN_VOICE_BLOB_BYTES) {
        toast.error(t('voiceNoteTooShort'));
        return;
      }
      const gate = await runMessagingGate();
      if (!gate) return;
      setUploadBusy(true);
      try {
        const filename = voiceFilenameForMime(mimeType);
        const { fileId, attachmentEnc } = await uploadEncryptedAttachment(blob, filename, mimeType);
        await sendMessage('', 'voice', fileId, attachmentEnc);
      } catch {
        toast.error(t('voiceNoteFailed'));
      } finally {
        setUploadBusy(false);
      }
    } catch {
      toast.error(t('voiceNoteFailed'));
    }
  }, [runMessagingGate, sendMessage, setUploadBusy, t, uploadEncryptedAttachment]);

  const startRecording = useCallback(async () => {
    if (voiceRecordingRef.current) return null;
    const gate = await runMessagingGate();
    if (!gate) return null;
    const ok = await ensureMediaPermissions({ audio: true, video: false }, { t });
    if (!ok) return null;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const session = startVoiceRecording(stream);
      voiceRecordingRef.current = session;
      return session;
    } catch {
      toast.error(t('micPermissionDenied'));
      return null;
    }
  }, [runMessagingGate, t]);

  const cancelRecording = useCallback(() => {
    const session = voiceRecordingRef.current;
    if (!session) return;
    voiceRecordingRef.current = null;
    session.stop();
    // eslint-disable-next-line no-restricted-syntax -- intentional: user cancelled recording, result is discarded
    session.done.catch(() => {});
  }, []);

  const stopRecordingAndSend = useCallback(async (existingSession) => {
    const session = existingSession || voiceRecordingRef.current;
    if (!session) return;
    voiceRecordingRef.current = null;
    await finishVoiceRecording(session);
  }, [finishVoiceRecording]);

  const finishVideoRecording = useCallback(async (session) => {
    if (!session) return;
    session.stop();
    try {
      const { blob, mimeType } = await session.done;
      onVideoRecordingEndRef.current?.();
      if (blob.size < MIN_VIDEO_BLOB_BYTES) {
        toast.error(t('videoNoteTooShort'));
        return;
      }
      const gate = await runMessagingGate();
      if (!gate) return;
      setUploadBusy(true);
      try {
        const filename = videoFilenameForMime(mimeType);
        const { fileId, attachmentEnc } = await uploadEncryptedAttachment(blob, filename, mimeType);
        await sendMessage('', 'video', fileId, attachmentEnc);
      } catch {
        toast.error(t('videoNoteFailed'));
      } finally {
        setUploadBusy(false);
      }
    } catch {
      onVideoRecordingEndRef.current?.();
      toast.error(t('videoNoteFailed'));
    }
  }, [runMessagingGate, sendMessage, setUploadBusy, t, uploadEncryptedAttachment]);

  const startVideoRecordingSession = useCallback(async () => {
    if (videoRecordingRef.current) return null;
    const gate = await runMessagingGate();
    if (!gate) return null;
    const ok = await ensureMediaPermissions({ audio: true, video: true }, { t });
    if (!ok) return null;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      });
      const session = startVideoRecording(stream, {
        onMaxDuration: () => {
          const active = videoRecordingRef.current;
          if (!active) return;
          videoRecordingRef.current = null;
          onVideoRecordingEndRef.current?.();
          toast.info(t('videoNoteMaxDuration'));
          finishVideoRecording(active);
        },
      });
      videoRecordingRef.current = session;
      return session;
    } catch {
      toast.error(t('cameraPermissionDenied'));
      return null;
    }
  }, [finishVideoRecording, runMessagingGate, t]);

  const cancelVideoRecording = useCallback(() => {
    const session = videoRecordingRef.current;
    if (!session) return;
    videoRecordingRef.current = null;
    onVideoRecordingEndRef.current?.();
    session.stop();
    // eslint-disable-next-line no-restricted-syntax -- intentional: user cancelled recording, result is discarded
    session.done.catch(() => {});
  }, []);

  const stopVideoRecordingAndSend = useCallback(async (existingSession) => {
    const session = existingSession || videoRecordingRef.current;
    if (!session) return;
    videoRecordingRef.current = null;
    await finishVideoRecording(session);
  }, [finishVideoRecording]);

  const setVideoRecordingEndHandler = useCallback((fn) => {
    onVideoRecordingEndRef.current = fn;
  }, []);

  return {
    voiceRecordingRef,
    sendMessage,
    editMessage,
    attachFile,
    sendBundledSticker,
    sendRemoteGif,
    sendPoll,
    sendLocation,
    startRecording,
    cancelRecording,
    stopRecordingAndSend,
    startVideoRecordingSession,
    cancelVideoRecording,
    stopVideoRecordingAndSend,
    setVideoRecordingEndHandler,
  };
}