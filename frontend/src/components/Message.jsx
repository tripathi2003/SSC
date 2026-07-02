import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocale } from '../context/LocaleContext';
import { Translate, Paperclip, Check, Checks, DownloadSimple } from '@phosphor-icons/react';
import { retryIngestMessagePlaintext } from '../lib/messageIngest';
import { getMessagePlaintextEntry, subscribeMessagePlaintext } from '../lib/messagePlaintextStore';
import { decryptMessageBody } from '../lib/signal/migration';
import { isSignalV1Message } from '../lib/signal/messages';
import { isSignalV1AttachmentMessage } from '../lib/signal/attachments';
import { translateMessageText } from '../lib/translation/translateClient';
import { formatFileSize, filenameFromCaption } from '../lib/attachmentUtils';
import { useDecryptedAttachment } from '../lib/attachmentDecrypt';
import ImagePreviewModal from './ImagePreviewModal';
import CountdownBadge from './CountdownBadge';
import { useConversationLongPress } from './ConversationActionsSheet';
import { isMessageDeleted } from '../lib/messageDelete';
import { groupReactionsForDisplay } from '../lib/messageReactions';
import { splitTextForHighlight } from '../lib/chatSearch';
import RichTextContent from './RichTextContent';
import { extractFirstPreviewUrl } from '../lib/linkPreview';
import LinkPreviewCard from './LinkPreviewCard';
import VoiceNotePlayer from './VoiceNotePlayer';
import VideoNotePlayer from './VideoNotePlayer';
import PollMessage from './PollMessage';
import LocationMessage from './LocationMessage';
import { recordDiagnostic } from '../lib/diagnosticLog';
import { subscribeMemoryWipe } from '../lib/memoryWipe';
import { getSentPlaintext } from '../lib/sentPlaintextCache';


function HighlightedText({ text, query }) {
  const parts = splitTextForHighlight(text, query);
  return (
    <>
      {parts.map((part, i) => (
        part.match
          ? <mark key={i} className="bg-[#FFD600]/35 text-inherit rounded-sm px-0.5">{part.text}</mark>
          : <span key={i}>{part.text}</span>
      ))}
    </>
  );
}

export default function Message({
  msg, isMine, myUserId, privateKey, peerUserId = null, autoTranslate, translationEnabled = false,
  translationOnDevice = false, serverTranslationAllowed = false,
  translateModelDownload = null,
  targetLang, sourceLang, reads = [], participantsCount = 2,
  readReceiptsEnabled = true,
  quotedPreview = null,
  onLongPress,
  onReactionToggle,
  onPollVote,
  pollVoting = false,
  searchQuery = '',
  isSearchMatch = false,
  isActiveSearchMatch = false,
  linkPreviewsEnabled = false,
  isGroup = false,
  groupMembers = [],
}) {
  const [plaintext, setPlaintext] = useState(null);
  const [translated, setTranslated] = useState(null);
  const [translating, setTranslating] = useState(false);
  const [showTranslated, setShowTranslated] = useState(false);
  const [error, setError] = useState(null);
  const [vaultLocked, setVaultLocked] = useState(false);
  const [decrypting, setDecrypting] = useState(true);
  const [decryptAttempt, setDecryptAttempt] = useState(0);
  const plaintextRef = useRef(null);
  const { t } = useLocale();
  const deleted = isMessageDeleted(msg);
  const reactionGroups = useMemo(
    () => groupReactionsForDisplay(msg.reactions || [], myUserId),
    [msg.reactions, myUserId],
  );
  const previewUrl = useMemo(() => {
    if (deleted || msg.message_type !== 'text' || !plaintext) return null;
    return extractFirstPreviewUrl(plaintext);
  }, [deleted, msg.message_type, plaintext]);

  useEffect(() => {
    plaintextRef.current = plaintext;
  }, [plaintext]);

  const retryDecrypt = useCallback(() => {
    setError(null);
    setVaultLocked(false);
    setPlaintext(null);
    setDecrypting(true);
    setDecryptAttempt((n) => n + 1);
    // Engine 8.6 dual-read: attempt unified decrypt directly, fall back to ingest pipeline.
    decryptMessageBody(msg, { myUserId, peerUserId, privateKey })
      .then((pt) => { setPlaintext(pt); setDecrypting(false); })
      .catch(() => retryIngestMessagePlaintext(msg, { myUserId, peerUserId, privateKey }).catch(() => {}));
  }, [msg, myUserId, peerUserId, privateKey]);

  useEffect(() => subscribeMemoryWipe(() => {
    setPlaintext(null);
    setTranslated(null);
    setTranslating(false);
    setShowTranslated(false);
    setError(null);
    setVaultLocked(false);
  }), []);

  useEffect(() => {
    if (deleted) {
      setPlaintext(null);
      setError(null);
      setVaultLocked(false);
      setDecrypting(false);
      return undefined;
    }

    const applyFromStore = () => {
      const entry = getMessagePlaintextEntry(msg.message_id);
      if (entry?.plaintext != null) {
        setPlaintext(entry.plaintext);
        setError(null);
        setVaultLocked(false);
        setDecrypting(false);
        return 'ready';
      }
      if (isMine && isSignalV1Message(msg)) {
        const cached = getSentPlaintext(msg.message_id, msg.ciphertext);
        setPlaintext(cached);
        setError(null);
        setVaultLocked(false);
        setDecrypting(false);
        return 'ready';
      }
      if (entry?.error) {
        setDecrypting(false);
        setVaultLocked(false);
        const code = entry.error;
        if (code === 'VAULT_LOCKED') {
          setPlaintext(null);
          setError(null);
          setVaultLocked(true);
          return 'vault';
        }
        const prior = plaintextRef.current;
        if (prior != null && prior !== '') {
          setPlaintext(prior);
          setError(null);
          return 'prior';
        }
        if (code === 'NO_KEY') setError('NO_KEY');
        else if (code === 'DECRYPT_STALE') setError('DECRYPT_STALE');
        else setError('DECRYPT_FAIL');
        if (code !== 'DECRYPT_STALE') {
          recordDiagnostic({
            category: 'libsignal',
            source: 'Message.display',
            message: code,
            detail: {
              message_id: msg?.message_id,
              conversation_id: msg?.conversation_id,
              protocol: msg?.protocol,
              signal_message_type: msg?.signal_message_type,
            },
          });
        }
        return 'error';
      }
      setDecrypting(true);
      setError(null);
      setVaultLocked(false);
      return 'pending';
    };

    applyFromStore();

    const slowTimer = setTimeout(() => {
      setError((prev) => (prev ? prev : 'DECRYPT_SLOW'));
    }, 8000);

    const unsub = subscribeMessagePlaintext((id) => {
      if (id == null || id === msg.message_id) {
        const next = applyFromStore();
        if (next === 'ready' || next === 'prior') {
          setError(null);
        }
      }
    });

    return () => {
      clearTimeout(slowTimer);
      unsub();
    };
  }, [msg.message_id, msg.ciphertext, msg.conversation_id, msg.protocol, msg.signal_message_type, myUserId, peerUserId, decryptAttempt, deleted, isMine]);

  const sameLanguage = Boolean(
    sourceLang && targetLang && sourceLang.toLowerCase() === targetLang.toLowerCase(),
  );

  useEffect(() => {
    if (sameLanguage) {
      setTranslated(null);
      setShowTranslated(false);
      return;
    }
    if (translationEnabled && autoTranslate && plaintext && !isMine && targetLang) {
      translateNow();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [translationEnabled, autoTranslate, plaintext, targetLang, sourceLang, sameLanguage]);

  const translateNow = async () => {
    if (!translationEnabled || !plaintext || translating || sameLanguage) return;
    setTranslating(true);
    try {
      const result = await translateMessageText({
        text: plaintext,
        sourceLang,
        targetLang,
        serverAllowed: serverTranslationAllowed,
      });
      if (result.note === 'same language' || !result.translated) {
        setTranslated(null);
        return;
      }
      setTranslated(result.translated);
      setShowTranslated(true);
    } catch {
      setTranslated(null);
    } finally {
      setTranslating(false);
    }
  };

  const bubbleClass = isMine
    ? 'bg-[#1E2A38] text-white rounded-md rounded-tr-sm self-end'
    : 'bg-[#232323] text-[#F0F0F0] rounded-md rounded-tl-sm self-start';

  const attachmentEncrypted = isSignalV1AttachmentMessage(msg)
    || Boolean(msg.attachment_iv && msg.attachment_encrypted_keys);

  const longPressHandlers = useConversationLongPress(
    onLongPress && !deleted ? () => onLongPress(msg) : null,
  );

  return (
    <div
      className={`flex flex-col max-w-[78%] ${isMine ? 'self-end items-end' : 'self-start items-start'} fade-up`}
      {...(onLongPress && !deleted ? longPressHandlers : {})}
    >
      <div
        className={`px-3 py-2 ${bubbleClass} text-sm leading-relaxed break-words shadow ${
          isActiveSearchMatch ? 'ring-2 ring-[#FFD600]' : isSearchMatch ? 'ring-1 ring-[#00E5FF]/40' : ''
        }`}
        data-testid={`message-${msg.message_id}`}
      >
        {deleted && (
          <span className="text-xs italic text-[#A1A1AA]" data-testid={`message-deleted-${msg.message_id}`}>
            {t('messageDeleted')}
          </span>
        )}
        {!deleted && msg.forwarded_from_message_id && (
          <div
            className="text-[10px] font-mono text-[#A1A1AA] tracking-wider mb-1"
            data-testid={`forwarded-${msg.message_id}`}
          >
            {t('messageForwarded')}
          </div>
        )}
        {!deleted && quotedPreview && (
          <div
            className="mb-2 pl-2 border-l-2 border-[#00E5FF]/70 text-xs"
            data-testid={`quote-${msg.message_id}`}
          >
            <div className="font-mono text-[10px] text-[#00E5FF] tracking-wider truncate">
              {quotedPreview.author ? `@${quotedPreview.author}` : '…'}
            </div>
            <div className="text-[#A1A1AA] truncate mt-0.5">{quotedPreview.preview}</div>
          </div>
        )}
        {!deleted && error === 'DECRYPT_STALE' && (
          <span className="text-xs text-[#A1A1AA] italic" data-testid={`message-stale-${msg.message_id}`}>
            {t('messageDecryptStale')}
          </span>
        )}
        {!deleted && error === 'DECRYPT_FAIL' && (
          <span className="text-xs text-[#FF3B30]">
            {t('messageDecryptFail')}
            <button type="button" onClick={retryDecrypt} className="ml-2 underline hover:text-white">{t('messageDecryptRetry')}</button>
          </span>
        )}
        {!deleted && error === 'NO_KEY' && (
          <span className="text-xs text-[#FF3B30]">
            {t('messageDecryptNoKey')}
            <button type="button" onClick={retryDecrypt} className="ml-2 underline hover:text-white">{t('messageDecryptRetry')}</button>
          </span>
        )}
        {!deleted && error === 'DECRYPT_SLOW' && plaintext === null && !vaultLocked && (
          <span className="text-xs text-[#FF9500]">
            {t('messageDecryptSlow')}
            <button type="button" onClick={retryDecrypt} className="ml-2 underline hover:text-white">{t('messageDecryptRetry')}</button>
          </span>
        )}
        {!deleted && vaultLocked && (
          <span className="text-xs text-[#FF9500]">{t('messageVaultLocked')}</span>
        )}
        {!deleted && isMine && isSignalV1Message(msg) && !error && !decrypting && plaintext === null && (
          <span className="text-xs text-[#A1A1AA] italic">{t('encryptedMessage')}</span>
        )}
        {!deleted && !error && !vaultLocked && decrypting && plaintext === null && (
          <span className="text-xs text-[#A1A1AA]">{t('messageDecrypting')}</span>
        )}
        {!deleted && !error && plaintext !== null && (
          <>
            {msg.message_type === 'image' && msg.attachment_id ? (
              attachmentEncrypted ? (
                <EncryptedImageAttachment
                  msg={msg} fileId={msg.attachment_id} caption={plaintext}
                  privateKey={privateKey} myUserId={myUserId} peerUserId={peerUserId}
                  searchQuery={searchQuery}
                />
              ) : (
                <LegacyAttachmentPlaceholder kind="image" caption={plaintext} searchQuery={searchQuery} />
              )
            ) : msg.message_type === 'file' && msg.attachment_id ? (
              attachmentEncrypted ? (
                <EncryptedFileAttachment
                  msg={msg} fileId={msg.attachment_id} caption={plaintext}
                  privateKey={privateKey} myUserId={myUserId} peerUserId={peerUserId}
                  searchQuery={searchQuery}
                />
              ) : (
                <LegacyAttachmentPlaceholder kind="file" caption={plaintext} searchQuery={searchQuery} />
              )
            ) : msg.message_type === 'voice' && msg.attachment_id ? (
              attachmentEncrypted ? (
                <EncryptedVoiceAttachment
                  msg={msg} fileId={msg.attachment_id}
                  privateKey={privateKey} myUserId={myUserId} peerUserId={peerUserId}
                />
              ) : (
                <LegacyAttachmentPlaceholder kind="voice" />
              )
            ) : msg.message_type === 'sticker' && msg.attachment_id ? (
              attachmentEncrypted ? (
                <EncryptedStickerAttachment
                  msg={msg} fileId={msg.attachment_id}
                  privateKey={privateKey} myUserId={myUserId} peerUserId={peerUserId}
                />
              ) : (
                <LegacyAttachmentPlaceholder kind="sticker" />
              )
            ) : msg.message_type === 'gif' && msg.attachment_id ? (
              attachmentEncrypted ? (
                <EncryptedGifAttachment
                  msg={msg} fileId={msg.attachment_id}
                  privateKey={privateKey} myUserId={myUserId} peerUserId={peerUserId}
                />
              ) : (
                <LegacyAttachmentPlaceholder kind="gif" />
              )
            ) : msg.message_type === 'video' && msg.attachment_id ? (
              attachmentEncrypted ? (
                <EncryptedVideoAttachment
                  msg={msg} fileId={msg.attachment_id}
                  privateKey={privateKey} myUserId={myUserId} peerUserId={peerUserId}
                />
              ) : (
                <LegacyAttachmentPlaceholder kind="video" />
              )
            ) : msg.message_type === 'poll' ? (
              <PollMessage
                msg={msg}
                plaintext={plaintext}
                myUserId={myUserId}
                onPollVote={onPollVote}
                voting={pollVoting}
              />
            ) : msg.message_type === 'location' ? (
              <LocationMessage plaintext={plaintext} messageId={msg.message_id} />
            ) : (
              <div>
                <RichTextContent
                  text={showTranslated && translated ? translated : plaintext}
                  searchQuery={searchQuery}
                  isGroup={isGroup}
                  groupMembers={groupMembers}
                  myUserId={myUserId}
                  mentionedUserIds={msg.mentioned_user_ids}
                />
                {linkPreviewsEnabled && previewUrl && (
                  <LinkPreviewCard url={previewUrl} />
                )}
              </div>
            )}
            {!isMine && translated && (
              <div className="mt-1 text-[10px] font-mono text-[#A1A1AA] tracking-wider uppercase">
                {showTranslated ? `TRANSLATED · ${targetLang.toUpperCase()}` : 'ORIGINAL'}
                <button onClick={() => setShowTranslated(!showTranslated)} className="ml-2 underline hover:text-white" data-testid={`toggle-translation-${msg.message_id}`}>
                  {showTranslated ? 'show original' : 'show translated'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
      {!deleted && reactionGroups.length > 0 && (
        <div
          className={`flex flex-wrap gap-1 mt-1 max-w-[78%] ${isMine ? 'self-end justify-end' : 'self-start justify-start'}`}
          data-testid={`reactions-${msg.message_id}`}
        >
          {reactionGroups.map((g) => (
            <button
              key={g.emoji}
              type="button"
              onClick={() => onReactionToggle?.(msg, g.emoji)}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ${
                g.mine
                  ? 'border-[#00E5FF]/60 bg-[#00E5FF]/10'
                  : 'border-[#27272A] bg-[#1A1A1A]'
              }`}
              data-testid={`reaction-pill-${msg.message_id}-${g.emoji}`}
            >
              <span>{g.emoji}</span>
              {g.count > 1 && <span className="font-mono text-[10px] text-[#A1A1AA]">{g.count}</span>}
            </button>
          ))}
        </div>
      )}
      <div className={`mt-1 flex items-center gap-2 text-[10px] font-mono text-[#A1A1AA] tracking-wider ${isMine ? 'justify-end' : 'justify-start'}`}>
        <span>{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        {msg.edited_at && (
          <>
            <span className="opacity-50">·</span>
            <span data-testid={`message-edited-${msg.message_id}`}>{t('messageEdited')}</span>
          </>
        )}
        <span className="opacity-50">·</span>
        <CountdownBadge expiresAt={msg.expires_at} />
        {isMine && readReceiptsEnabled && (() => {
          const otherReaders = reads.filter((r) => r.user_id !== myUserId && r.last_read_message_id);
          const readByCount = otherReaders.filter((r) => {
            return r.last_read_message_id === msg.message_id || (r.last_read_at && new Date(r.last_read_at) >= new Date(msg.created_at));
          }).length;
          const expected = participantsCount - 1;
          if (readByCount >= expected && expected > 0) {
            return <Checks size={12} className="text-[#00E5FF]" weight="bold" data-testid={`read-${msg.message_id}`} title="Read by all" />;
          }
          if (readByCount > 0) {
            return <Checks size={12} className="text-[#A1A1AA]" data-testid={`read-${msg.message_id}`} title={`Read by ${readByCount}`} />;
          }
          return <Check size={12} className="text-[#A1A1AA]" data-testid={`delivered-${msg.message_id}`} title="Sent" />;
        })()}
        {translationEnabled && !isMine && !sameLanguage && plaintext && !translated && !translating && (
          <button onClick={translateNow} className="ml-1 hover:text-[#FFD600] flex items-center gap-1" data-testid={`translate-button-${msg.message_id}`} title={translationOnDevice ? 'on-device' : 'server'}>
            <Translate size={10} /> translate
          </button>
        )}
        {translating && (
          <span data-testid={`translating-${msg.message_id}`}>
            {translateModelDownload?.state === 'downloading' && translateModelDownload.percent != null
              ? t('translateDownloading', { percent: Math.round(translateModelDownload.percent) })
              : t('translating')}
          </span>
        )}
      </div>
    </div>
  );
}

function EncryptedImageAttachment({ msg, fileId, caption, privateKey, myUserId, peerUserId, searchQuery = '' }) {
  const { objectUrl, error, loading } = useDecryptedAttachment(msg, fileId, privateKey, myUserId, peerUserId);
  const [previewOpen, setPreviewOpen] = useState(false);

  if (loading) return <span className="font-mono text-xs text-[#A1A1AA]">decrypting attachment…</span>;
  if (error) return <span className="font-mono text-xs text-[#FF3B30]">[{error === 'NO_KEY' ? 'no key for attachment' : 'unable to decrypt attachment'}]</span>;

  const alt = filenameFromCaption(caption, 'image');

  return (
    <div>
      <button
        type="button"
        onClick={() => setPreviewOpen(true)}
        className="block rounded-md overflow-hidden hover:brightness-110 transition"
        data-testid={`image-${fileId}`}
      >
        <img src={objectUrl} alt={alt} className="rounded-md max-w-[280px] max-h-[280px] object-cover cursor-zoom-in" />
      </button>
      {caption && (
        <div className="mt-1 text-sm">
          {searchQuery.trim() ? <HighlightedText text={caption} query={searchQuery} /> : caption}
        </div>
      )}
      {previewOpen && (
        <ImagePreviewModal src={objectUrl} alt={alt} onClose={() => setPreviewOpen(false)} />
      )}
    </div>
  );
}

function EncryptedFileAttachment({ msg, fileId, caption, privateKey, myUserId, peerUserId, searchQuery = '' }) {
  const { objectUrl, blob, error, loading } = useDecryptedAttachment(msg, fileId, privateKey, myUserId, peerUserId);
  if (loading) return <span className="font-mono text-xs text-[#A1A1AA]">decrypting file…</span>;
  if (error) return <span className="font-mono text-xs text-[#FF3B30]">[{error === 'NO_KEY' ? 'no key for file' : 'unable to decrypt file'}]</span>;

  const name = filenameFromCaption(caption);
  const sizeLabel = blob ? formatFileSize(blob.size) : '';

  return (
    <a
      href={objectUrl}
      download={name}
      className="flex items-center gap-3 p-2 rounded-md bg-[#1A1A1A] tac-border hover:bg-[#232323] transition min-w-[200px]"
      data-testid={`file-${fileId}`}
    >
      <Paperclip size={18} className="text-[#00E5FF] shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-sm truncate">
          {searchQuery.trim() ? <HighlightedText text={name} query={searchQuery} /> : name}
        </div>
        {sizeLabel && (
          <div className="text-[10px] font-mono text-[#A1A1AA] tracking-wider">{sizeLabel}</div>
        )}
      </div>
      <DownloadSimple size={16} className="text-[#A1A1AA] shrink-0" />
    </a>
  );
}

function EncryptedStickerAttachment({ msg, fileId, privateKey, myUserId, peerUserId }) {
  const { objectUrl, error, loading } = useDecryptedAttachment(msg, fileId, privateKey, myUserId, peerUserId);

  if (loading) return <span className="font-mono text-xs text-[#A1A1AA]">decrypting sticker…</span>;
  if (error) return <span className="font-mono text-xs text-[#FF3B30]">[unable to decrypt sticker]</span>;

  return (
    <img
      src={objectUrl}
      alt="sticker"
      className="w-32 h-32 object-contain"
      data-testid={`sticker-${fileId}`}
    />
  );
}

function EncryptedGifAttachment({ msg, fileId, privateKey, myUserId, peerUserId }) {
  const { objectUrl, error, loading } = useDecryptedAttachment(msg, fileId, privateKey, myUserId, peerUserId);
  const [previewOpen, setPreviewOpen] = useState(false);

  if (loading) return <span className="font-mono text-xs text-[#A1A1AA]">decrypting gif…</span>;
  if (error) return <span className="font-mono text-xs text-[#FF3B30]">[unable to decrypt gif]</span>;

  return (
    <div>
      <button
        type="button"
        onClick={() => setPreviewOpen(true)}
        className="block rounded-md overflow-hidden hover:brightness-110 transition"
        data-testid={`gif-${fileId}`}
      >
        <img src={objectUrl} alt="gif" className="rounded-md max-w-[280px] max-h-[280px] object-cover cursor-zoom-in" />
      </button>
      {previewOpen && (
        <ImagePreviewModal src={objectUrl} alt="gif" onClose={() => setPreviewOpen(false)} />
      )}
    </div>
  );
}

function EncryptedVideoAttachment({ msg, fileId, privateKey, myUserId, peerUserId }) {
  const { objectUrl, error, loading } = useDecryptedAttachment(msg, fileId, privateKey, myUserId, peerUserId);

  if (loading) return <span className="font-mono text-xs text-[#A1A1AA]">decrypting video…</span>;
  if (error) return <span className="font-mono text-xs text-[#FF3B30]">[{error === 'NO_KEY' ? 'no key for video' : 'unable to decrypt video'}]</span>;

  return <VideoNotePlayer objectUrl={objectUrl} fileId={fileId} />;
}

function EncryptedVoiceAttachment({ msg, fileId, privateKey, myUserId, peerUserId }) {
  const { objectUrl, error, loading } = useDecryptedAttachment(msg, fileId, privateKey, myUserId, peerUserId);

  if (loading) return <span className="font-mono text-xs text-[#A1A1AA]">decrypting voice…</span>;
  if (error) return <span className="font-mono text-xs text-[#FF3B30]">[{error === 'NO_KEY' ? 'no key for voice' : 'unable to decrypt voice'}]</span>;

  return <VoiceNotePlayer objectUrl={objectUrl} fileId={fileId} />;
}

function LegacyAttachmentPlaceholder({ kind, caption, searchQuery = '' }) {
  return (
    <div className="font-mono text-xs text-[#A1A1AA]" data-testid={`legacy-attachment-${kind}`}>
      loading attachment…
      {caption && kind !== 'voice' && kind !== 'video' && (
        <div className="mt-1 text-sm text-[#F0F0F0]">
          {searchQuery.trim() ? <HighlightedText text={caption} query={searchQuery} /> : caption}
        </div>
      )}
    </div>
  );
}