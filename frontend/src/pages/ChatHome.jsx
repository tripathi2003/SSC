import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { MagnifyingGlass, Plus, SignOut, Phone, VideoCamera, PaperPlaneTilt, Paperclip, ShieldCheck, Translate, X, UsersThree, Gear, Microphone, CaretLeft, CaretDown, CaretUp, PushPin, Images, FilmStrip, Smiley, ChartBar, MapPin, Megaphone } from '@phosphor-icons/react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { recordDiagnostic } from '../lib/diagnosticLog';


import { subscribePush } from '../lib/push';
import { subscribeNativePush } from '../lib/native-push';
import Message from '../components/Message';
import MessageActionsSheet from '../components/MessageActionsSheet';
import ReplyComposerBar from '../components/ReplyComposerBar';
import GroupMentionPicker from '../components/GroupMentionPicker';
import ComposerFormatBar from '../components/ComposerFormatBar';
import EditMessageModal from '../components/EditMessageModal';
import ForwardMessageModal from '../components/ForwardMessageModal';
import PanicButton from '../components/PanicButton';
import CallModal from '../components/CallModal';
import SettingsModal from '../components/SettingsModal';
import OnboardingCoach, { hasCompletedOnboarding } from '../components/OnboardingCoach';
import Avatar from '../components/Avatar';
import ConfirmDialog from '../components/ConfirmDialog';
import CreateGroupModal from '../components/CreateGroupModal';
import GroupManageModal from '../components/GroupManageModal';
import GroupTopicsBar from '../components/GroupTopicsBar';
import CreateGroupTopicModal from '../components/CreateGroupTopicModal';
import BroadcastListsModal from '../components/BroadcastListsModal';
import BroadcastSendModal from '../components/BroadcastSendModal';
import { ConversationListSkeleton, MessagesSkeleton } from '../components/ChatSkeleton';
import ConversationActionsSheet, { ConversationListRow } from '../components/ConversationActionsSheet';
import ChatMessageSearchBar from '../components/ChatMessageSearchBar';
import GlobalMessageSearchModal from '../components/GlobalMessageSearchModal';
import ChatMediaGalleryModal from '../components/ChatMediaGalleryModal';
import VideoRecordPreview from '../components/VideoRecordPreview';
import StickerGifPickerModal from '../components/StickerGifPickerModal';
import CreatePollModal from '../components/CreatePollModal';
import { applyPollVoteUpdate } from '../lib/pollMessage';
import { gifSearchEnabled, subscribeGifSearchPrefs } from '../lib/gifSearchPrefs';
import { useGlobalMessageSearch } from '../chat/useGlobalMessageSearch';
import { linkPreviewsEnabled, subscribeLinkPreviewPrefs } from '../lib/linkPreviewPrefs';
import { clearLinkPreviewCache } from '../lib/linkPreviewFetch';
import { clampSearchMatchIndex } from '../lib/chatSearch';
import ProfileContactSheet from '../components/ProfileContactSheet';
import MuteDurationSheet from '../components/MuteDurationSheet';
import VerifyHandshakeModal from '../components/VerifyHandshakeModal';
import KeyChangeWarningBanner from '../components/KeyChangeWarningBanner';
import {
  KEY_CHANGE_EVENT,
  acknowledgePeerIdentity,
  isPeerIdentityChanged,
  seedTrustedIdentityIfMissing,
} from '../lib/keyChangeWarnings';
import { useLocale } from '../context/LocaleContext';
import { useMobileLayout, useSplitChatLayout } from '../lib/use-mobile';
import MobileChatMenu, { MenuAction } from '../components/MobileChatMenu';
import GroupCallModal from '../components/GroupCallModal';
import GroupCallSfuModal from '../components/GroupCallSfuModal';
import { StoriesBar, StoryViewer } from '../components/Stories';
import ContactsModal from '../components/ContactsModal';
import { formatPeerPresence } from '../lib/presence';

import { chatListPath, chatNavigateOptions, chatThreadPath } from '../lib/chatNavigation';
import {
  clearNativeBackHandler,
  minimizeNativeApp,
  setNativeBackHandler,
} from '../lib/nativeBack';
import { isElectronApp, isInstalledClient, isNativeApp } from '../lib/platform';
import {
  getTranslateModelDownloadStatus,
  subscribeTranslateModelDownloadProgress,
} from '../lib/translation/translateModelProgress';
import TranslationModelDownloadBanner from '../components/TranslationModelDownloadBanner';
import { scheduleBackgroundUpdateCheck } from '../lib/clientUpdates';
import {
  formatRetentionDuration,
  normalizeRetentionHours,
} from '../lib/retentionDisplay';
import { readReceiptsEnabled, typingIndicatorsEnabled } from '../lib/privacySettings';
import { getResolvedSenderId } from '../lib/signal/sealedSender';
import {
  areDesktopNotificationsEnabled,
  bindDesktopBadgeClearOnFocus,
  subscribeDesktopNavigation,
  syncDesktopNotificationPref,
} from '../lib/desktopNotifications';
import { useChatSocket } from '../chat/useChatSocket';
import { useChatContacts } from '../chat/useChatContacts';
import { useChatMessages } from '../chat/useChatMessages';
import { useMessagingSend } from '../chat/useMessagingSend';
import { useChatCalls } from '../chat/useChatCalls';
import { useHoldToRecord } from '../chat/useHoldToRecord';
import { buildQuotePreview, findMessageById } from '../lib/messageReply';
import { applyMessageDeleted, canUnsendMessage } from '../lib/messageDelete';
import { applyMessageEdited, canEditMessage } from '../lib/messageEdit';
import {
  buildForwardPreview,
  canForwardMessage,
  eligibleForwardTargets,
} from '../lib/messageForward';
import { sendForwardToConversation } from '../chat/forwardMessageSend';
import { sendTextToConversation } from '../chat/notificationReplySend';
import {
  clearPendingReplyDraft,
  drainPendingNotificationReplies,
  peekPendingReplyDraft,
  setNotificationReplyHandler,
} from '../lib/notificationReply';
import { toastMessagingGateFailure } from '../chat/messagingErrors';
import { applyMessageReactionUpdate, canReactToMessage } from '../lib/messageReactions';
import {
  filterMentionCandidates,
  getActiveMentionAtCursor,
  insertMentionAt,
} from '../lib/groupMentions';
import { prefixSelectionAsList, wrapSelectionWithMarkers } from '../lib/composerFormatting';
import { listChatImageMedia } from '../lib/chatMediaGallery';

import { startIncomingRingtone, stopIncomingRingtone } from '../lib/callRingtone';
import {
  isConversationMuted,
  isPeerBlocked,
} from '../lib/contactFilters';
import { muteLabelForConversation } from '../lib/muteDurations';
import { groupAvatarProps, groupDescriptionLine } from '../lib/groupAvatar';
import { formatGroupConversationLabel } from '../lib/groupDisplayLabel';
import { formatUserLabel, userHandle, userPrimaryLabel } from '../lib/displayName';
import { canPostInGroup } from '../lib/groupRoles';
import { GENERAL_TOPIC_ID } from '../lib/groupTopics';
import { clearLocalGroupLabels } from '../lib/groupLabels';

import { registerMemoryWipeHandler, registerSocketCloser } from '../lib/memoryWipe';
import { fetchRetentionConfig } from '../lib/publicConfig';
import { resolveIncomingSignaling } from '../chat/signalingInbound';

const PENDING_CALL_KEY = 'ssc_pending_call';

export default function ChatHome() {
  const { user, privateKey, logout, panicWipe, refreshUser } = useAuth();
  const navigate = useNavigate();
  const { conversationId } = useParams();
  const [activeId, setActiveId] = useState(null);
  const [draft, setDraft] = useState('');
  const [muteSheetTarget, setMuteSheetTarget] = useState(null);
  const [composerCursor, setComposerCursor] = useState(0);
  const messageInputRef = useRef(null);
  const [autoTranslate, setAutoTranslate] = useState(false);
  const [translationEnabled, setTranslationEnabled] = useState(false);
  const [translationOnDevice, setTranslationOnDevice] = useState(false);
  const [serverTranslationAllowed, setServerTranslationAllowed] = useState(false);
  const [translateModelDownload, setTranslateModelDownload] = useState({ state: 'idle' });
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [globalSearchQ, setGlobalSearchQ] = useState('');
  const [pendingScrollMessageId, setPendingScrollMessageId] = useState(null);
  const [linkPreviewOn, setLinkPreviewOn] = useState(() => linkPreviewsEnabled());
  const [contactsOpen, setContactsOpen] = useState(false);

  const [typingFrom, setTypingFrom] = useState(null);
  const [callState, setCallState] = useState(null); // { mode, direction, peer, signal }
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [confirmRemoveUid, setConfirmRemoveUid] = useState(null);
  const [chatSearchOpen, setChatSearchOpen] = useState(false);
  const [mediaGalleryOpen, setMediaGalleryOpen] = useState(false);
  const [videoPreviewStream, setVideoPreviewStream] = useState(null);
  const [stickerPickerOpen, setStickerPickerOpen] = useState(false);
  const [pollModalOpen, setPollModalOpen] = useState(false);
  const [pollSending, setPollSending] = useState(false);
  const [pollVotingId, setPollVotingId] = useState(null);
  const [locationConfirmOpen, setLocationConfirmOpen] = useState(false);
  const [gifSearchOn, setGifSearchOn] = useState(() => gifSearchEnabled());
  const [searchMatchIndex, setSearchMatchIndex] = useState(0);
  const [chatMenuOpen, setChatMenuOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const [broadcastListsOpen, setBroadcastListsOpen] = useState(false);
  const [broadcastSendOpen, setBroadcastSendOpen] = useState(false);
  const [broadcastSendList, setBroadcastSendList] = useState(null);
  const [groupManageOpen, setGroupManageOpen] = useState(false);
  const [activeTopicId, setActiveTopicId] = useState(GENERAL_TOPIC_ID);
  const [topicModalOpen, setTopicModalOpen] = useState(false);
  const [topicBusy, setTopicBusy] = useState(false);
  const activeTopicIdRef = useRef(GENERAL_TOPIC_ID);

  const [storyGroup, setStoryGroup] = useState(null);
  const [groupCallState, setGroupCallState] = useState(null); // {mode, direction, members, signal}
  const [convActionsTarget, setConvActionsTarget] = useState(null);
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  const [messageActionTarget, setMessageActionTarget] = useState(null);
  const [unsendTarget, setUnsendTarget] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [editDraft, setEditDraft] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [forwardTarget, setForwardTarget] = useState(null);
  const [forwardBusy, setForwardBusy] = useState(false);
  const [profileSheetOpen, setProfileSheetOpen] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [keyChangeWarning, setKeyChangeWarning] = useState(false);
  const [retentionHours, setRetentionHours] = useState(24);
  const displayRetentionHours = normalizeRetentionHours(user?.retention_hours, retentionHours);
  const socketRef = useRef(null);
  const scrollRef = useRef(null);
  const { t } = useLocale();

  const goToConversation = useCallback((id) => {
    setActiveId(id);
    if (id) {
      navigate(chatThreadPath(id), chatNavigateOptions(id));
    } else {
      navigate(chatListPath(), chatNavigateOptions(null));
    }
  }, [navigate]);

  const leaveChat = useCallback(() => {
    setChatMenuOpen(false);
    setChatSearchOpen(false);
    setSearchMatchIndex(0);
    goToConversation(null);
  }, [goToConversation]);

  const {
    conversations,
    setConversations,
    conversationsLoading,
    myContacts,
    pendingRequests,
    outgoingRequests,
    conversationsRef,
    myContactsRef,
    refreshContactsRosterRef,
    loadConversations,
    sidebarConversations,
    archivedConversations,
    activeConv,
    peer,
    isGroup,
    acceptedContacts,
    sendFriendRequest,
    acceptRequest,
    rejectRequest,
    toggleBlock,
    toggleMute,
    muteConversation,
    unmuteConversation,
    prepareConversationChannel,
    togglePin,
    toggleArchive,
    removeContact,
    confirmRemoveContact,
    deleteConversation,
    refreshActiveGroup,
  } = useChatContacts({
    user,
    t,
    activeId,
    leaveChat,
    confirmRemoveUid,
    setConfirmRemoveUid,
  });

  const {
    messages,
    setMessages,
    messagesLoading,
    reads,
    setReads,
    messageFilter,
    setMessageFilter,
    filteredMessages,
    searchMatchIds,
    decryptedBodies,
    userNearBottomRef,
    onMessagesScroll,
  } = useChatMessages({
    activeId,
    user,
    peer,
    privateKey,
    isGroup,
    activeConv,
    activeTopicId,
  });

  const imageMediaItems = useMemo(() => listChatImageMedia(messages), [messages]);

  useEffect(() => subscribeLinkPreviewPrefs(setLinkPreviewOn), []);
  useEffect(() => subscribeGifSearchPrefs(setGifSearchOn), []);

  const {
    results: globalSearchResults,
    loading: globalSearchLoading,
    clearCache: clearGlobalSearchCache,
  } = useGlobalMessageSearch({
    open: globalSearchOpen,
    query: globalSearchQ,
    conversations,
    myContacts,
    user,
    privateKey,
  });

  useEffect(() => {
    const closeSocket = () => {
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
    };
    const unsubSocket = registerSocketCloser(closeSocket);
    const unsubWipe = registerMemoryWipeHandler(() => {
      closeSocket();
      setMessages([]);
      setDraft('');
      setConversations([]);
      setReads([]);
      setTypingFrom(null);
      setStoryGroup(null);
      setCallState(null);
      setGroupCallState(null);
      clearGlobalSearchCache();
      clearLinkPreviewCache();
      stopIncomingRingtone();
      clearLocalGroupLabels();
      setActiveId(null);
    });
    return () => {
      unsubSocket();
      unsubWipe();
    };
  }, [setConversations, setMessages, setReads]);
  const headerTitle = isGroup
    ? (formatGroupConversationLabel(activeConv) || t('group'))
    : (peer ? userPrimaryLabel(peer) : '');
  const splitLayout = useSplitChatLayout();
  const isSinglePane = useMobileLayout();
  const showList = splitLayout || !activeId;
  const showChatPanel = splitLayout || !!activeId;
  const sameLangAsPeer = !isGroup && peer?.language && user?.language
    && peer.language.toLowerCase() === user.language.toLowerCase();
  const showTranslateControls = translationEnabled && !sameLangAsPeer;
  const peerContact = peer ? myContacts.find((c) => c.user_id === peer.user_id) : null;
  const canMessagePeer = isGroup || !peer || (!!peerContact && !peerContact.blocked);
  const canComposeInChat = isGroup
    ? canPostInGroup(activeConv, user?.user_id)
    : canMessagePeer;
  const isRequestPendingPeer = !isGroup && !!peer
    && outgoingRequests.some((r) => r.to_user_id === peer.user_id);

  useEffect(() => {
    if (!peer?.user_id || isGroup) {
      setKeyChangeWarning(false);
      return;
    }
    seedTrustedIdentityIfMissing(peer);
    setKeyChangeWarning(isPeerIdentityChanged(peer));
  }, [peer, isGroup]);

  useEffect(() => {
    const onKeyChange = (event) => {
      if (event?.detail?.peerUserId === peer?.user_id) {
        setKeyChangeWarning(event.detail.active !== false);
      }
    };
    window.addEventListener(KEY_CHANGE_EVENT, onKeyChange);
    return () => window.removeEventListener(KEY_CHANGE_EVENT, onKeyChange);
  }, [peer?.user_id]);

  useEffect(() => {
    (async () => {
      try {
        const { resolveTranslationAvailability } = await import('../lib/translation/translateClient');
        const avail = await resolveTranslationAvailability();
        setTranslationOnDevice(avail.onDevice);
        setServerTranslationAllowed(avail.serverAllowed);
        setTranslationEnabled(avail.enabled);
      } catch {
        setTranslationEnabled(false);
        setTranslationOnDevice(false);
        setServerTranslationAllowed(false);
      }
    })();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const retention = await fetchRetentionConfig();
      if (!cancelled) setRetentionHours(retention.hours);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!translationEnabled) setAutoTranslate(false);
  }, [translationEnabled]);

  useEffect(() => {
    if (!isElectronApp() || !translationOnDevice) return undefined;
    let cancelled = false;
    getTranslateModelDownloadStatus().then((status) => {
      if (!cancelled && status?.state) setTranslateModelDownload(status);
    }).catch((err) => {
      recordDiagnostic({ category: 'api', source: 'ChatHome/translateModelStatus', message: err?.message || 'translate model status failed', detail: err });
    });
    return subscribeTranslateModelDownloadProgress((status) => {
      if (status?.state) setTranslateModelDownload(status);
    });
  }, [translationOnDevice]);

  const onDeviceAutoTranslateHint = useCallback(() => (
    isElectronApp() ? t('autoTranslateOnDeviceDesktop') : t('autoTranslateOnDevice')
  ), [t]);

  // Build recipients map for outgoing message encryption
  const recipientsForActive = useMemo(() => {
    if (!activeConv || !user) return {};
    const myPub = user.public_key ? (typeof user.public_key === 'string' ? JSON.parse(user.public_key) : user.public_key) : null;
    const map = { [user.user_id]: myPub };
    if (isGroup && activeConv.members) {
      for (const m of activeConv.members) {
        if (m.public_key) map[m.user_id] = typeof m.public_key === 'string' ? JSON.parse(m.public_key) : m.public_key;
      }
    } else if (peer?.public_key) {
      map[peer.user_id] = typeof peer.public_key === 'string' ? JSON.parse(peer.public_key) : peer.public_key;
    }
    return map;
  }, [activeConv, user, peer, isGroup]);

  const quoteContext = useMemo(() => ({
    user,
    peer,
    members: activeConv?.members || [],
    isGroup,
  }), [user, peer, activeConv, isGroup]);

  const quoteByMessageId = useMemo(() => {
    const map = {};
    for (const m of messages) {
      if (!m.reply_to_message_id) continue;
      const target = findMessageById(messages, m.reply_to_message_id);
      map[m.message_id] = buildQuotePreview(
        target,
        target ? decryptedBodies[target.message_id] : null,
        quoteContext,
        t,
      );
    }
    return map;
  }, [messages, decryptedBodies, quoteContext, t]);

  const replyComposerQuote = useMemo(() => {
    if (!replyTo) return null;
    return buildQuotePreview(replyTo, decryptedBodies[replyTo.message_id], quoteContext, t);
  }, [replyTo, decryptedBodies, quoteContext, t]);

  const onMessageLongPress = useCallback((msg) => {
    setMessageActionTarget(msg);
  }, []);

  const onMessageReaction = useCallback(async (msg, emoji) => {
    if (!activeId || !msg) return;
    try {
      const { data } = await api.post('/messages/reactions', {
        conversation_id: activeId,
        message_id: msg.message_id,
        emoji,
      });
      setMessages((cur) => applyMessageReactionUpdate(cur, data));
    } catch (e) {
      toast.error(e?.response?.data?.detail || t('messageReactionFailed'));
    }
  }, [activeId, setMessages, t]);

  const onPollVote = useCallback(async (msg, optionIndex) => {
    if (!activeId || !msg || pollVotingId) return;
    setPollVotingId(msg.message_id);
    try {
      const { data } = await api.post('/messages/poll-vote', {
        conversation_id: activeId,
        message_id: msg.message_id,
        option_index: optionIndex,
      });
      setMessages((cur) => applyPollVoteUpdate(cur, data));
    } catch (e) {
      toast.error(e?.response?.data?.detail || t('pollVoteFailed'));
    } finally {
      setPollVotingId(null);
    }
  }, [activeId, pollVotingId, setMessages, t]);

  const onCreatePoll = useCallback(async (draft) => {
    setPollSending(true);
    try {
      await sendPoll(draft);
      setPollModalOpen(false);
    } finally {
      setPollSending(false);
    }
  }, [sendPoll]);

  const onReplyToMessage = useCallback((msg) => {
    setReplyTo(msg);
  }, []);

  const onDeleteMessageRequest = useCallback((msg) => {
    setUnsendTarget(msg);
  }, []);

  const onEditMessageRequest = useCallback((msg) => {
    setEditTarget(msg);
    setEditDraft(decryptedBodies[msg.message_id] || '');
  }, [decryptedBodies]);

  const forwardDestinations = useMemo(
    () => eligibleForwardTargets(conversations, myContacts, { excludeConversationId: activeId }),
    [conversations, myContacts, activeId],
  );

  const forwardPreview = useMemo(() => {
    if (!forwardTarget) return null;
    return buildForwardPreview(
      forwardTarget,
      decryptedBodies[forwardTarget.message_id],
      quoteContext,
      t,
    );
  }, [forwardTarget, decryptedBodies, quoteContext, t]);

  const onForwardMessageRequest = useCallback((msg) => {
    setForwardTarget(msg);
  }, []);

  const confirmForward = useCallback(async (selectedIds) => {
    if (!forwardTarget || !selectedIds?.length) return;
    const text = (decryptedBodies[forwardTarget.message_id] || '').trim();
    if (!text) {
      toast.error(t('messageForwardEmpty'));
      return;
    }
    setForwardBusy(true);
    let sent = 0;
    try {
      for (const convId of selectedIds) {
        const conv = forwardDestinations.find((c) => c.conversation_id === convId)
          || conversations.find((c) => c.conversation_id === convId);
        if (!conv) continue;
        try {
          await sendForwardToConversation({
            text,
            forwardedFromMessageId: forwardTarget.message_id,
            targetConv: conv,
            user,
            privateKey,
            refreshUser,
          });
          sent += 1;
        } catch (e) {
          if (e?.gate) toastMessagingGateFailure(e.gate, t);
          else toast.error(e?.response?.data?.detail || e?.message || t('messageForwardFailed'));
        }
      }
      if (sent > 0) {
        toast.success(t('messageForwardSuccess', { count: sent }));
        loadConversations();
      }
    } finally {
      setForwardBusy(false);
      setForwardTarget(null);
    }
  }, [
    forwardTarget,
    decryptedBodies,
    forwardDestinations,
    conversations,
    user,
    privateKey,
    refreshUser,
    loadConversations,
    t,
  ]);

  const confirmUnsendMessage = useCallback(async () => {
    if (!unsendTarget || !activeId) return;
    try {
      const { data } = await api.post('/messages/unsend', {
        conversation_id: activeId,
        message_id: unsendTarget.message_id,
      });
      setMessages((cur) => applyMessageDeleted(cur, {
        message_id: unsendTarget.message_id,
        deleted_at: data?.deleted_for_everyone_at,
      }));
      if (replyTo?.message_id === unsendTarget.message_id) setReplyTo(null);
      toast.success(t('messageUnsendSuccess'));
    } catch (e) {
      toast.error(e?.response?.data?.detail || t('messageUnsendFailed'));
    } finally {
      setUnsendTarget(null);
    }
  }, [unsendTarget, activeId, setMessages, replyTo, t]);

  useEffect(() => {
    setReplyTo(null);
    setMessageActionTarget(null);
    setUnsendTarget(null);
    setEditTarget(null);
    setEditDraft('');
    setForwardTarget(null);
  }, [activeId]);

  const {
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
  } = useMessagingSend({
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
  });

  const saveEditMessage = useCallback(async (newText) => {
    if (!editTarget) return;
    setEditSaving(true);
    try {
      const data = await editMessage(editTarget, newText);
      if (data) {
        setMessages((cur) => applyMessageEdited(cur, data));
        toast.success(t('messageEditSuccess'));
        setEditTarget(null);
        setEditDraft('');
      }
    } finally {
      setEditSaving(false);
    }
  }, [editTarget, editMessage, setMessages, t]);

  const {
    startCall,
    acceptCall,
    rejectCall,
    rejectGroupCall,
    acceptGroupCall,
  } = useChatCalls({
    isGroup,
    peer,
    activeConv,
    activeId,
    user,
    myContacts,
    callState,
    setCallState,
    groupCallState,
    setGroupCallState,
    socketRef,
    refreshUser,
    t,
  });

  const {
    isRecording,
    onVoicePointerDown,
    onVoicePointerUp,
    onVoicePointerCancel,
    onVoiceClick,
  } = useHoldToRecord({
    startRecording,
    stopRecordingAndSend,
    cancelRecording,
  });

  const clearVideoPreview = useCallback(() => {
    setVideoPreviewStream(null);
  }, []);

  useEffect(() => {
    setVideoRecordingEndHandler(() => {
      clearVideoPreview();
    });
    return () => setVideoRecordingEndHandler(null);
  }, [setVideoRecordingEndHandler, clearVideoPreview]);

  const startVideoWithPreview = useCallback(async () => {
    const session = await startVideoRecordingSession();
    if (session?.stream) setVideoPreviewStream(session.stream);
    return session;
  }, [startVideoRecordingSession]);

  const stopVideoWithPreview = useCallback(async (session) => {
    clearVideoPreview();
    await stopVideoRecordingAndSend(session);
  }, [clearVideoPreview, stopVideoRecordingAndSend]);

  const cancelVideoWithPreview = useCallback(() => {
    clearVideoPreview();
    cancelVideoRecording();
  }, [clearVideoPreview, cancelVideoRecording]);

  const {
    isRecording: isVideoRecording,
    onVoicePointerDown: onVideoPointerDown,
    onVoicePointerUp: onVideoPointerUp,
    onVoicePointerCancel: onVideoPointerCancel,
    onVoiceClick: onVideoClick,
  } = useHoldToRecord({
    startRecording: startVideoWithPreview,
    stopRecordingAndSend: stopVideoWithPreview,
    cancelRecording: cancelVideoWithPreview,
  });

  const onSendText = (e) => {
    e?.preventDefault?.();
    if (!draft.trim()) return;
    sendMessage(draft.trim(), 'text');
  };

  useChatSocket({
    user,
    activeId,
    peer,
    t,
    leaveChat,
    loadConversations,
    setMessages,
    setTypingFrom,
    setCallState,
    setGroupCallState,
    setReads,
    socketRef,
    conversationsRef,
    myContactsRef,
    refreshContactsRosterRef,
    activeTopicIdRef,
  });

  useEffect(() => {
    setActiveId(conversationId || null);
  }, [conversationId]);

  useEffect(() => {
    activeTopicIdRef.current = activeTopicId;
  }, [activeTopicId]);

  useEffect(() => {
    setActiveTopicId(GENERAL_TOPIC_ID);
    setReplyTo(null);
  }, [activeId, setReplyTo]);

  const onSelectGroupTopic = useCallback((topicId) => {
    setActiveTopicId(topicId || GENERAL_TOPIC_ID);
    setReplyTo(null);
    setChatSearchOpen(false);
    setMessageFilter('');
  }, [setMessageFilter, setReplyTo]);

  const createGroupTopic = useCallback(async (name) => {
    if (!activeId || topicBusy) return;
    setTopicBusy(true);
    try {
      const { data } = await api.post(`/conversations/${activeId}/topics`, { name });
      await loadConversations();
      const created = (data.group_topics || [])
        .filter((topic) => topic.topic_id !== GENERAL_TOPIC_ID)
        .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))[0];
      if (created?.topic_id) setActiveTopicId(created.topic_id);
      setTopicModalOpen(false);
      toast.success(t('groupTopicCreated'));
    } catch (e) {
      toast.error(e?.response?.data?.detail || t('groupTopicCreateFailed'));
    } finally {
      setTopicBusy(false);
    }
  }, [activeId, loadConversations, t, topicBusy]);

  useEffect(() => {
    if (!isNativeApp()) return undefined;
    setNativeBackHandler(() => {
      if (confirmRemoveUid) {
        setConfirmRemoveUid(null);
        return;
      }
      if (profileSheetOpen) {
        setProfileSheetOpen(false);
        return;
      }
      if (forwardTarget) {
        setForwardTarget(null);
        return;
      }
      if (editTarget) {
        setEditTarget(null);
        setEditDraft('');
        return;
      }
      if (unsendTarget) {
        setUnsendTarget(null);
        return;
      }
      if (messageActionTarget) {
        setMessageActionTarget(null);
        return;
      }
      if (convActionsTarget) {
        setConvActionsTarget(null);
        return;
      }
      if (chatMenuOpen) {
        setChatMenuOpen(false);
        return;
      }
      if (chatSearchOpen) {
        setChatSearchOpen(false);
        setMessageFilter('');
        setSearchMatchIndex(0);
        return;
      }
      if (settingsOpen) {
        setSettingsOpen(false);
        return;
      }
      if (contactsOpen) {
        setContactsOpen(false);
        return;
      }
      if (globalSearchOpen) {
        setGlobalSearchOpen(false);
        setGlobalSearchQ('');
        return;
      }
      if (mediaGalleryOpen) {
        setMediaGalleryOpen(false);
        return;
      }
      if (stickerPickerOpen) {
        setStickerPickerOpen(false);
        return;
      }
      if (pollModalOpen) {
        setPollModalOpen(false);
        return;
      }
      if (locationConfirmOpen) {
        setLocationConfirmOpen(false);
        return;
      }
      if (searchOpen) {
        setSearchOpen(false);
        return;
      }
      if (groupOpen) {
        setGroupOpen(false);
        return;
      }
      if (broadcastSendOpen) {
        setBroadcastSendOpen(false);
        setBroadcastSendList(null);
        return;
      }
      if (broadcastListsOpen) {
        setBroadcastListsOpen(false);
        return;
      }
      if (onboardingOpen) {
        setOnboardingOpen(false);
        return;
      }
      if (storyGroup) {
        setStoryGroup(null);
        return;
      }
      if (callState?.direction === 'incoming') {
        rejectCall();
        return;
      }
      if (groupCallState?.direction === 'incoming') {
        rejectGroupCall();
        return;
      }
      if (conversationId || activeId) {
        leaveChat();
        return;
      }
      minimizeNativeApp();
    });
    return () => clearNativeBackHandler();
  }, [
    activeId,
    chatMenuOpen,
    convActionsTarget,
    messageActionTarget,
    unsendTarget,
    editTarget,
    forwardTarget,
    confirmRemoveUid,
    contactsOpen,
    profileSheetOpen,
    conversationId,
    groupOpen,
    broadcastSendOpen,
    broadcastListsOpen,
    leaveChat,
    chatSearchOpen,
    onboardingOpen,
    globalSearchOpen,
    mediaGalleryOpen,
    stickerPickerOpen,
    pollModalOpen,
    locationConfirmOpen,
    searchOpen,
    settingsOpen,
    storyGroup,
    callState,
    groupCallState,
    rejectCall,
    rejectGroupCall,
  ]);

  const hasIncomingCall = (callState?.direction === 'incoming')
    || (groupCallState?.direction === 'incoming');

  useEffect(() => {
    if (hasIncomingCall) {
      const backgrounded = document.hidden || !document.hasFocus();
      const notifOn = areDesktopNotificationsEnabled();
      if (!backgrounded || notifOn) {
        startIncomingRingtone();
      }
    } else {
      stopIncomingRingtone();
    }
    return () => stopIncomingRingtone();
  }, [hasIncomingCall]);

  const handlePendingCall = useCallback(async (payload) => {
    const raw = payload?.data || payload;
    if (!raw?.from) return;
    try {
      const resolved = await resolveIncomingSignaling(raw, {
        myUserId: user?.user_id,
        peerUserId: raw.from,
      });
      if (!resolved.ok && resolved.encrypted) {
        toast.error(t('callSignalingDecryptFailed'));
        return;
      }
      const data = resolved.ok ? resolved.signal : raw;

      const { data: peerData } = await api.get(`/users/${data.from}/public`);
      const mode = data.mode || 'audio';
      if (data.conversation_id) goToConversation(data.conversation_id);
      if (payload?.action === 'decline') {
        socketRef.current?.send({ type: 'call-reject', to: data.from });
        return;
      }
      if (data.group) {
        const members = (data.members || []).filter((m) => m.user_id !== user?.user_id);
        if (members.length === 0) members.push({ user_id: data.from, username: peerData.username });
        setGroupCallState({
          mode,
          direction: payload?.action === 'answer' ? 'incoming-accepted' : 'incoming',
          members,
          conversationId: data.conversation_id || null,
          signal: {
            from: data.from,
            from_username: peerData.username,
            sdp: data.sdp,
            members: data.members,
          },
        });
      } else {
        setCallState({
          mode,
          direction: payload?.action === 'answer' ? 'incoming-accepted' : 'incoming',
          peer: peerData,
          signal: data.sdp ? { sdp: data.sdp } : null,
        });
      }
    } catch (err) {
      console.error('[SSC] pending call handling failed:', err?.message || err);
      toast.error(t('callIncomingFailed'));
    }
  }, [goToConversation, user?.user_id, socketRef, t]);

  useEffect(() => {
    const onCallEnded = () => {
      stopIncomingRingtone();
      setCallState(null);
      setGroupCallState(null);
    };
    window.addEventListener('ssc-call-ended', onCallEnded);
    return () => window.removeEventListener('ssc-call-ended', onCallEnded);
  }, []);

  useEffect(() => {
    const raw = sessionStorage.getItem(PENDING_CALL_KEY);
    if (raw) {
      sessionStorage.removeItem(PENDING_CALL_KEY);
      try { handlePendingCall(JSON.parse(raw)); } catch {}
    }
    const h = (e) => handlePendingCall(e.detail);
    window.addEventListener('ssc-call-notification', h);
    return () => window.removeEventListener('ssc-call-notification', h);
  }, [handlePendingCall]);

  useEffect(() => {
    if (!user?.user_id) return;
    if (!hasCompletedOnboarding(user.user_id) && !conversationId) {
      setOnboardingOpen(true);
    }
  }, [user?.user_id, conversationId]);

  useEffect(() => {
    if (activeId && onboardingOpen) {
      setOnboardingOpen(false);
    }
  }, [activeId, onboardingOpen]);

  const pushRegisteredRef = useRef(false);

  // Register push silently once per session (no in-app spam toasts)
  useEffect(() => {
    if (!user || pushRegisteredRef.current) return;
    pushRegisteredRef.current = true;
    subscribePush().catch((err) => {
      recordDiagnostic({ category: 'api', source: 'ChatHome/subscribePush', message: err?.message || 'push subscription failed', detail: err });
    });
    subscribeNativePush().catch((err) => {
      recordDiagnostic({ category: 'api', source: 'ChatHome/subscribeNativePush', message: err?.message || 'native push subscription failed', detail: err });
    });
  }, [user]);

  useEffect(() => {
    if (!user?.user_id || !isNativeApp()) return undefined;
    setNotificationReplyHandler(async ({ conversationId, text }) => {
      try {
        await sendTextToConversation({
          conversationId,
          text,
          user,
          privateKey,
          refreshUser,
        });
        toast.success(t('notificationReplySent'));
        return { sent: true };
      } catch (err) {
        if (err?.gate) {
          toastMessagingGateFailure(err.gate, t);
        } else if (err?.message !== 'conversation_not_found') {
          toast.error(t('notificationReplyFailed'));
        }
        return { sent: false };
      }
    });
    drainPendingNotificationReplies().catch((err) => {
      recordDiagnostic({ category: 'messaging', source: 'ChatHome/drainNotificationReplies', message: err?.message || 'drain notification replies failed', detail: err });
    });
    return () => setNotificationReplyHandler(null);
  }, [user, privateKey, refreshUser, t]);

  useEffect(() => {
    if (!user?.user_id || !isNativeApp()) return undefined;
    const applyDraft = (detail) => {
      if (!detail?.text) return;
      if (detail.conversationId && activeId && detail.conversationId !== activeId) return;
      setDraft(detail.text);
      clearPendingReplyDraft();
    };
    const pending = peekPendingReplyDraft();
    if (pending) applyDraft(pending);
    const onDraft = (event) => applyDraft(event?.detail || {});
    window.addEventListener('ssc-pending-reply-draft', onDraft);
    return () => window.removeEventListener('ssc-pending-reply-draft', onDraft);
  }, [user?.user_id, activeId]);

  useEffect(() => {
    if (!isElectronApp()) return undefined;
    if (!user?.user_id) {
      window.sscDesktop?.notifications?.setEnabled?.(false).catch((err) => {
        recordDiagnostic({ category: 'api', source: 'ChatHome/desktopNotifDisable', message: err?.message || 'disable desktop notifications failed', detail: err });
      });
      return undefined;
    }
    syncDesktopNotificationPref();
    return bindDesktopBadgeClearOnFocus();
  }, [user?.user_id]);

  useEffect(() => {
    if (!isElectronApp() || !user?.user_id) return undefined;
    return subscribeDesktopNavigation((payload) => {
      if (payload?.conversationId) {
        goToConversation(payload.conversationId);
      } else if (payload?.panel === 'contacts') {
        setContactsOpen(true);
      } else if (payload?.route) {
        navigate(payload.route);
      }
    });
  }, [user?.user_id, goToConversation, navigate]);

  useEffect(() => {
    if (!user?.user_id || !isInstalledClient()) return undefined;
    return scheduleBackgroundUpdateCheck((result) => {
      const version = result.version || result.latestVersion;
      if (!version) return;
      toast.info(t('settingsUpdateBackgroundToast', { version }), { duration: 8000 });
    });
  }, [user?.user_id, t]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (userNearBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, activeId]);

  // ─── Search users ───
  useEffect(() => {
    if (!searchOpen || searchQ.length < 2) { setSearchResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const { data } = await api.get('/users/search', { params: { q: searchQ } });
        setSearchResults(data);
      } catch {}
    }, 300);
    return () => clearTimeout(t);
  }, [searchQ, searchOpen]);

  const startConversation = async (u) => {
    try {
      const { data } = await api.post('/conversations', { peer_username: u.username });
      await loadConversations();
      goToConversation(data.conversation_id);
      setSearchOpen(false);
      setSearchQ('');
    } catch (e) {
      const detail = e?.response?.data?.detail || '';
      if (detail.includes('contacts') || detail.includes('mutual')) {
        try {
          await sendFriendRequest(u);
          setSearchOpen(false);
          setSearchQ('');
        } catch (reqErr) {
          toast.error(reqErr?.response?.data?.detail || t('couldNotSendRequest'));
        }
      } else {
        toast.error(detail || t('couldNotStartChat'));
      }
    }
  };

  const fileInputRef = useRef(null);
  const onPickFile = () => fileInputRef.current?.click();

  const onFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!uploadBusy) await attachFile(file);
  };

  const onComposerPaste = async (e) => {
    const items = e.clipboardData?.items;
    if (!items?.length) return;
    for (const item of items) {
      if (item.kind === 'file' && item.type?.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file && !uploadBusy) await attachFile(file, { fromPaste: true });
        return;
      }
    }
  };

  useEffect(() => {
    setSearchMatchIndex(0);
  }, [messageFilter]);

  useEffect(() => {
    if (!chatSearchOpen || !messageFilter.trim() || searchMatchIds.length === 0) return;
    const id = searchMatchIds[searchMatchIndex];
    const el = document.querySelector(`[data-testid="message-${id}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [searchMatchIndex, searchMatchIds, chatSearchOpen, messageFilter]);

  useEffect(() => {
    if (!pendingScrollMessageId || messagesLoading) return;
    const el = document.querySelector(`[data-testid="message-${pendingScrollMessageId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setPendingScrollMessageId(null);
    }
  }, [pendingScrollMessageId, messagesLoading, messages]);

  const closeChatSearch = useCallback(() => {
    setChatSearchOpen(false);
    setMessageFilter('');
    setSearchMatchIndex(0);
  }, [setMessageFilter]);

  const onSearchPrev = useCallback(() => {
    setSearchMatchIndex((i) => clampSearchMatchIndex(i - 1, searchMatchIds.length));
  }, [searchMatchIds.length]);

  const onSearchNext = useCallback(() => {
    setSearchMatchIndex((i) => clampSearchMatchIndex(i + 1, searchMatchIds.length));
  }, [searchMatchIds.length]);

  const activeSearchMatchId = messageFilter.trim() && searchMatchIds.length
    ? searchMatchIds[searchMatchIndex]
    : null;

  const handleGlobalSearchPick = useCallback((hit) => {
    const q = globalSearchQ.trim();
    setGlobalSearchOpen(false);
    setGlobalSearchQ('');
    setPendingScrollMessageId(hit.message_id);
    setChatSearchOpen(true);
    setMessageFilter(q);
    setSearchMatchIndex(0);
    goToConversation(hit.conversation_id);
  }, [globalSearchQ, goToConversation, setMessageFilter]);

  const syncComposerCursor = useCallback(() => {
    const el = messageInputRef.current;
    if (el) setComposerCursor(el.selectionStart ?? draft.length);
  }, [draft.length]);

  const mentionActive = useMemo(() => {
    if (!isGroup || !draft) return null;
    return getActiveMentionAtCursor(draft, composerCursor, activeConv?.members || []);
  }, [isGroup, draft, composerCursor, activeConv]);

  const mentionCandidates = useMemo(() => {
    if (!mentionActive) return [];
    return filterMentionCandidates(
      mentionActive.query,
      activeConv?.members || [],
      user?.user_id,
    );
  }, [mentionActive, activeConv, user]);

  const applyComposerFormat = useCallback((action) => {
    const el = messageInputRef.current;
    if (!el) return;
    const start = el.selectionStart ?? draft.length;
    const end = el.selectionEnd ?? start;
    let result;
    if (action === 'bold') result = wrapSelectionWithMarkers(draft, start, end, '**');
    else if (action === 'italic') result = wrapSelectionWithMarkers(draft, start, end, '*');
    else if (action === 'bullet') result = prefixSelectionAsList(draft, start, end, false);
    else if (action === 'numbered') result = prefixSelectionAsList(draft, start, end, true);
    else return;
    setDraft(result.value);
    setComposerCursor(result.selectionStart);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(result.selectionStart, result.selectionEnd);
    });
  }, [draft]);

  useEffect(() => {
    const el = messageInputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, [draft]);

  const onPickMention = useCallback((member) => {
    if (mentionActive?.startIndex == null || !member?.username) return;
    const next = insertMentionAt(draft, mentionActive.startIndex, member.username);
    setDraft(next);
    const cursor = mentionActive.startIndex + member.username.length + 2;
    setComposerCursor(cursor);
    requestAnimationFrame(() => {
      const el = messageInputRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(cursor, cursor);
      }
    });
  }, [draft, mentionActive]);

  const onDraftChange = (v) => {
    setDraft(v);
    if (activeId && socketRef.current && typingIndicatorsEnabled(user)) {
      socketRef.current.send({ type: 'typing', conversation_id: activeId });
    }
    requestAnimationFrame(syncComposerCursor);
  };

  const openMuteSheet = useCallback((conversation) => {
    if (!conversation?.conversation_id) return;
    setMuteSheetTarget(conversation);
  }, []);

  const openMuteSheetForPeer = useCallback((uid) => {
    const conv = conversations.find((c) => !c.is_group && c.peer?.user_id === uid)
      || (activeConv?.peer?.user_id === uid ? activeConv : null);
    if (conv) openMuteSheet(conv);
  }, [conversations, activeConv, openMuteSheet]);

  const muteSheetTitle = useMemo(() => {
    if (!muteSheetTarget) return '';
    if (muteSheetTarget.is_group) {
      return formatGroupConversationLabel(muteSheetTarget) || t('group');
    }
    return userPrimaryLabel(muteSheetTarget.peer);
  }, [muteSheetTarget, t]);

  useEffect(() => {
    if (!activeId) return;
    prepareConversationChannel(activeId).catch((err) => {
      recordDiagnostic({ category: 'messaging', source: 'ChatHome/prepareChannel', message: err?.message || 'prepareConversationChannel failed', detail: err });
    });
  }, [activeId, prepareConversationChannel]);

  const renderSidebarConversationRow = useCallback((c) => {
    const mutedLabel = muteLabelForConversation(
      { ...c, muted: isConversationMuted(c, myContacts) },
      t,
    );
    const groupDesc = c.is_group ? groupDescriptionLine(c) : '';
    const avatarProps = groupAvatarProps(c);
    return (
      <ConversationListRow
        key={c.conversation_id}
        conversation={c}
        activeId={activeId}
        onSelect={goToConversation}
        onOpenActions={setConvActionsTarget}
      >
        <Avatar
          {...avatarProps}
          size="md"
          showOnline={!c.is_group}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium truncate">
              {c.is_group ? (formatGroupConversationLabel(c) || t('group')) : userPrimaryLabel(c.peer)}
              {mutedLabel && <span className="text-[#A1A1AA] font-mono text-[10px] ml-1">· {mutedLabel}</span>}
            </span>
            <span className="text-[10px] font-mono text-[#A1A1AA] flex items-center gap-1 shrink-0">
              {c.pinned && (
                <PushPin size={12} className="text-[#00E5FF]" weight="fill" data-testid={`pin-indicator-${c.conversation_id}`} />
              )}
              {c.is_group ? `${c.participants.length}P` : c.peer?.language?.toUpperCase()}
            </span>
          </div>
          {groupDesc ? (
            <div className="text-[11px] text-[#A1A1AA] truncate">{groupDesc}</div>
          ) : (
            <div className="text-[11px] text-[#A1A1AA] truncate font-mono">
              {c.last_activity?.has_messages ? `· ${t('encryptedMessage')} ·` : t('noMessagesYet')}
            </div>
          )}
        </div>
      </ConversationListRow>
    );
  }, [activeId, goToConversation, myContacts, t]);

  return (
    <div
      className="mobile-shell chat-shell flex bg-[#0A0A0A] text-[#F0F0F0] overflow-hidden"
      data-split={splitLayout ? 'true' : 'false'}
    >
      {/* Sidebar / chat list */}
      <aside
        className={`chat-sidebar ${showList ? 'flex' : 'hidden'} ${splitLayout ? 'chat-sidebar-split' : 'w-full'} flex-col shrink-0 min-h-0 border-[#27272A]`}
      >
        <div className="glass-header safe-top safe-x px-4 py-3 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2" data-testid="sidebar-logo">
            <Avatar user={user} size="xs" />
            <div>
              <div className="font-mono text-xs tracking-[0.25em]">SSC</div>
              <div className="text-[10px] font-mono text-[#A1A1AA] truncate max-w-[10rem]">
                {user?.display_name ? (
                  <span title={userHandle(user)}>{userPrimaryLabel(user)}</span>
                ) : (
                  userHandle(user)
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setSettingsOpen(true)} title={t('settings')} data-testid="open-settings-button"
              className="w-9 h-9 rounded-md tac-border bg-[#121212] hover:bg-[#1A1A1A] flex items-center justify-center">
              <Gear size={16} />
            </button>
            <PanicButton onWipe={panicWipe} />
            <button onClick={logout} title={t('logout')} data-testid="logout-button" className="w-9 h-9 rounded-md tac-border bg-[#121212] hover:bg-[#1A1A1A] flex items-center justify-center">
              <SignOut size={16} />
            </button>
          </div>
        </div>

        <div className="p-3 border-b border-[#27272A] flex flex-col gap-2">
          <div className="flex gap-2">
            <button onClick={() => setSearchOpen(true)} data-testid="new-chat-button"
              className="flex-1 h-10 rounded-md tac-border bg-[#121212] hover:bg-[#1A1A1A] flex items-center gap-2 px-3 text-sm text-[#A1A1AA]">
              <Plus size={16} /> {t('newChat')}
            </button>
            <button onClick={() => setGroupOpen(true)} title={t('createGroup')} data-testid="new-group-button"
              className="w-10 h-10 rounded-md tac-border bg-[#121212] hover:bg-[#1A1A1A] flex items-center justify-center">
              <UsersThree size={16} />
            </button>
            <button
              onClick={() => { setBroadcastSendList(null); setBroadcastSendOpen(true); }}
              title={t('broadcastSendTitle')}
              data-testid="broadcast-send-button"
              className="w-10 h-10 rounded-md tac-border bg-[#121212] hover:bg-[#1A1A1A] flex items-center justify-center"
            >
              <Megaphone size={16} />
            </button>
          </div>
          <button onClick={() => setContactsOpen(true)} data-testid="open-contacts-button"
            className="h-9 rounded-md tac-border bg-[#121212] hover:bg-[#1A1A1A] flex items-center justify-center gap-2 text-[10px] font-mono tracking-widest text-[#A1A1AA]">
            <UsersThree size={14} /> {t('contacts')}
            {pendingRequests.length > 0 && (
              <span className="bg-[#FFD600] text-black px-1.5 rounded text-[9px]">{pendingRequests.length}</span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setGlobalSearchOpen(true)}
            data-testid="open-global-search"
            className="h-9 rounded-md tac-border bg-[#121212] hover:bg-[#1A1A1A] flex items-center justify-center gap-2 text-[10px] font-mono tracking-widest text-[#A1A1AA]"
          >
            <MagnifyingGlass size={14} /> {t('globalSearchTitle')}
          </button>
        </div>

        {/* Stories bar */}
        <StoriesBar me={user} privateKey={privateKey} onView={(g) => setStoryGroup(g)} />

        <div className="flex-1 overflow-y-auto">
          {conversationsLoading && <ConversationListSkeleton />}
          {!conversationsLoading && sidebarConversations.length === 0 && archivedConversations.length === 0 && (
            <div className="p-6 text-center text-xs font-mono text-[#A1A1AA] tracking-wider">
              {t('noConversations')}
              <p className="mt-2 normal-case font-sans tracking-normal">{t('noConversationsHint')}</p>
            </div>
          )}
          {!conversationsLoading && sidebarConversations.map(renderSidebarConversationRow)}
          {!conversationsLoading && archivedConversations.length > 0 && (
            <div className="border-t border-[#27272A]">
              <button
                type="button"
                data-testid="archived-chats-toggle"
                onClick={() => setArchivedOpen((open) => !open)}
                className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-[#1A1A1A] transition"
              >
                <span className="text-[10px] font-mono tracking-widest text-[#A1A1AA]">
                  {t('archivedChatsTitle', { count: archivedConversations.length })}
                </span>
                {archivedOpen ? <CaretUp size={14} className="text-[#A1A1AA]" /> : <CaretDown size={14} className="text-[#A1A1AA]" />}
              </button>
              {archivedOpen && archivedConversations.map(renderSidebarConversationRow)}
            </div>
          )}
        </div>
      </aside>

      {/* Chat panel */}
      <main className={`chat-main ${showChatPanel ? 'flex' : 'hidden'} flex-1 flex-col min-h-0 min-w-0 w-full`}>
        {!activeConv ? (
          <div className={`flex-1 ${splitLayout ? 'flex' : 'hidden'} flex-col items-center justify-center text-center px-6 relative`}>
            <div
              aria-hidden
              className="absolute inset-0 opacity-[0.05] pointer-events-none"
              style={{ backgroundImage: 'linear-gradient(rgba(0,229,255,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(0,229,255,0.4) 1px, transparent 1px)', backgroundSize: '40px 40px' }}
            />
            <ShieldCheck size={48} weight="duotone" className="text-[#00E5FF] mb-4 relative" />
            <h2 className="font-mono text-2xl tracking-tighter relative">{t('selectChat')}</h2>
            <p className="text-sm text-[#A1A1AA] mt-2 relative">{t('selectChatHint')}</p>
          </div>
        ) : (
          <>
            <header className="glass-header safe-x px-2 md:px-4 py-2 md:py-3 flex items-center gap-2 shrink-0 relative z-[70]">
              {isSinglePane && (
                <button
                  type="button"
                  onClick={leaveChat}
                  className="w-10 h-10 rounded-md tac-border bg-[#121212] active:bg-[#1A1A1A] flex items-center justify-center shrink-0"
                  data-testid="chat-back-button"
                  aria-label={t('back')}
                >
                  <CaretLeft size={20} weight="bold" />
                </button>
              )}
              <div className="flex items-center gap-2 md:gap-3 flex-1 min-w-0">
                {!isGroup && peer ? (
                  <button
                    type="button"
                    onClick={() => setProfileSheetOpen(true)}
                    className="flex items-center gap-2 md:gap-3 min-w-0 text-left hover:opacity-90 transition"
                    data-testid="chat-profile-tap"
                  >
                    <Avatar user={peer} size="sm" showOnline />
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate" data-testid="chat-peer-username">
                        {headerTitle}
                      </div>
                      <div className="text-[10px] font-mono tracking-wider truncate flex items-center gap-1 text-[#A1A1AA]">
                        <span className="truncate" data-testid="chat-peer-status">
                          {`${formatPeerPresence(peer)} · ${peer?.language?.toUpperCase() || '—'}`}
                        </span>
                        <span className="text-[#34C759]" data-testid="chat-retention-badge">
                          · {formatRetentionDuration(displayRetentionHours, t)}
                        </span>
                      </div>
                    </div>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setGroupManageOpen(true)}
                    className="flex items-center gap-2 md:gap-3 min-w-0 text-left hover:opacity-90 transition"
                    data-testid="chat-group-manage-tap"
                  >
                    <Avatar {...groupAvatarProps(activeConv)} size="sm" />
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate" data-testid="chat-peer-username">
                        {headerTitle}
                      </div>
                      {isGroup && groupDescriptionLine(activeConv) && (
                        <div className="text-[10px] text-[#A1A1AA] truncate" data-testid="chat-group-description">
                          {groupDescriptionLine(activeConv)}
                        </div>
                      )}
                      <div className="text-[10px] font-mono tracking-wider truncate flex items-center gap-1 text-[#A1A1AA]">
                        <span className="truncate" data-testid="chat-peer-status">
                          {isGroup
                            ? `${activeConv.participants.length} ${t('members')}`
                            : `${formatPeerPresence(peer)} · ${peer?.language?.toUpperCase() || '—'}`}
                        </span>
                        <span className="text-[#34C759]" data-testid="chat-retention-badge">
                          · {formatRetentionDuration(displayRetentionHours, t)}
                        </span>
                      </div>
                    </div>
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1 md:gap-2 shrink-0">
                {isSinglePane ? (
                  <>
                    {!isGroup && peer && (
                      <MobileChatMenu
                        open={chatMenuOpen}
                        onToggle={() => setChatMenuOpen((v) => !v)}
                        onClose={() => setChatMenuOpen(false)}
                      >
                        {showTranslateControls && (
                          <MenuAction
                            testId="mobile-toggle-autotranslate"
                            onClick={() => {
                              setChatMenuOpen(false);
                              setAutoTranslate((v) => {
                                if (!v) {
                                  toast.info(translationOnDevice ? onDeviceAutoTranslateHint() : t('autoTranslateWarning'));
                                }
                                return !v;
                              });
                            }}
                          >
                            {t('autoTr')} {autoTranslate ? t('on') : t('off')}
                          </MenuAction>
                        )}
                        <MenuAction
                          testId="mobile-search-messages"
                          onClick={() => {
                            setChatMenuOpen(false);
                            setChatSearchOpen(true);
                          }}
                        >
                          {t('searchMessages')}
                        </MenuAction>
                        {imageMediaItems.length > 0 && (
                          <MenuAction
                            testId="mobile-media-gallery"
                            onClick={() => {
                              setChatMenuOpen(false);
                              setMediaGalleryOpen(true);
                            }}
                          >
                            {t('openMediaGallery')}
                          </MenuAction>
                        )}
                        <MenuAction
                          testId="mobile-block"
                          onClick={() => { setChatMenuOpen(false); toggleBlock(peer.user_id); }}
                        >
                          {peerContact?.blocked ? t('unblock') : t('block')}
                        </MenuAction>
                        <MenuAction
                          testId="mobile-mute"
                          onClick={() => { setChatMenuOpen(false); openMuteSheetForPeer(peer.user_id); }}
                        >
                          {peerContact?.muted ? t('unmute') : t('mute')}
                        </MenuAction>
                        <MenuAction
                          testId="mobile-delete-contact"
                          danger
                          onClick={() => { setChatMenuOpen(false); removeContact(peer.user_id); }}
                        >
                          {t('deleteContact')}
                        </MenuAction>
                      </MobileChatMenu>
                    )}
                    <button
                      type="button"
                      onClick={() => (chatSearchOpen ? closeChatSearch() : setChatSearchOpen(true))}
                      data-testid="open-chat-search"
                      className={`w-10 h-10 rounded-md tac-border flex items-center justify-center ${chatSearchOpen ? 'bg-[#00E5FF]/15 border-[#00E5FF]/40' : 'bg-[#121212] active:bg-[#1A1A1A]'}`}
                      title={t('searchMessages')}
                    >
                      <MagnifyingGlass size={18} />
                    </button>
                    {imageMediaItems.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setMediaGalleryOpen(true)}
                        data-testid="open-media-gallery"
                        className="w-10 h-10 rounded-md tac-border bg-[#121212] active:bg-[#1A1A1A] flex items-center justify-center"
                        title={t('openMediaGallery')}
                      >
                        <Images size={18} />
                      </button>
                    )}
                    <button onClick={() => startCall('audio')} data-testid="start-voice-call" className="w-10 h-10 rounded-md tac-border bg-[#121212] active:bg-[#1A1A1A] flex items-center justify-center" title={t('voiceCall')}>
                      <Phone size={18} />
                    </button>
                    <button onClick={() => startCall('video')} data-testid="start-video-call" className="w-10 h-10 rounded-md tac-border bg-[#121212] active:bg-[#1A1A1A] flex items-center justify-center" title={t('videoCall')}>
                      <VideoCamera size={18} />
                    </button>
                  </>
                ) : (
                  <>
                    {!isGroup && peer && (
                      <>
                        <button onClick={() => toggleBlock(peer.user_id)} className="text-[10px] px-2 py-1 tac-border rounded" data-testid="block-button">
                          {peerContact?.blocked ? t('unblock').toUpperCase() : t('block').toUpperCase()}
                        </button>
                        <button onClick={() => openMuteSheetForPeer(peer.user_id)} className="text-[10px] px-2 py-1 tac-border rounded" data-testid="mute-button">
                          {(activeConv?.muted || peerContact?.muted) ? t('muteNotifications').toUpperCase() : t('muteChat').toUpperCase()}
                        </button>
                        <button onClick={() => removeContact(peer.user_id)} className="text-[10px] px-2 py-1 tac-border rounded text-[#FF3B30]" data-testid="delete-contact-button">
                          {t('deleteLabel')}
                        </button>
                      </>
                    )}
                    {showTranslateControls && (
                      <button onClick={() => {
                        setAutoTranslate((v) => {
                          if (!v) {
                            toast.info(translationOnDevice ? onDeviceAutoTranslateHint() : t('autoTranslateWarning'));
                          }
                          return !v;
                        });
                      }} data-testid="toggle-autotranslate"
                        className={`h-9 px-3 rounded-md tac-border flex items-center gap-2 text-xs font-mono tracking-widest ${autoTranslate ? 'bg-[#FFD600] text-black' : 'bg-[#121212] hover:bg-[#1A1A1A]'}`}>
                        <Translate size={14} /> {t('autoTr')} {autoTranslate ? t('on') : t('off')}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => (chatSearchOpen ? closeChatSearch() : setChatSearchOpen(true))}
                      data-testid="open-chat-search"
                      className={`w-9 h-9 rounded-md tac-border flex items-center justify-center ${chatSearchOpen ? 'bg-[#00E5FF]/15 border-[#00E5FF]/40' : 'bg-[#121212] hover:bg-[#1A1A1A]'}`}
                      title={t('searchMessages')}
                    >
                      <MagnifyingGlass size={16} />
                    </button>
                    {imageMediaItems.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setMediaGalleryOpen(true)}
                        data-testid="open-media-gallery"
                        className="w-9 h-9 rounded-md tac-border bg-[#121212] hover:bg-[#1A1A1A] flex items-center justify-center"
                        title={t('openMediaGallery')}
                      >
                        <Images size={16} />
                      </button>
                    )}
                    <button onClick={() => startCall('audio')} data-testid="start-voice-call" className="w-9 h-9 rounded-md tac-border bg-[#121212] hover:bg-[#1A1A1A] flex items-center justify-center" title={t('voiceCall')}>
                      <Phone size={16} />
                    </button>
                    <button onClick={() => startCall('video')} data-testid="start-video-call" className="w-9 h-9 rounded-md tac-border bg-[#121212] hover:bg-[#1A1A1A] flex items-center justify-center" title={t('videoCall')}>
                      <VideoCamera size={16} />
                    </button>
                  </>
                )}
              </div>
            </header>

            {isGroup && (
              <GroupTopicsBar
                conversation={activeConv}
                activeTopicId={activeTopicId}
                myUserId={user?.user_id}
                onSelectTopic={onSelectGroupTopic}
                onCreateTopic={() => setTopicModalOpen(true)}
              />
            )}

            <ChatMessageSearchBar
              open={chatSearchOpen}
              query={messageFilter}
              onQueryChange={setMessageFilter}
              onClose={closeChatSearch}
              matchIndex={searchMatchIndex}
              matchCount={searchMatchIds.length}
              onPrev={onSearchPrev}
              onNext={onSearchNext}
            />

            {translationOnDevice && (
              <TranslationModelDownloadBanner status={translateModelDownload} />
            )}

            {!isGroup && keyChangeWarning && peer && (
              <KeyChangeWarningBanner
                peerUsername={peer.username}
                onReview={() => setVerifyOpen(true)}
                onDismiss={() => {
                  acknowledgePeerIdentity(peer);
                  setKeyChangeWarning(false);
                }}
              />
            )}

            <div ref={scrollRef} onScroll={() => onMessagesScroll(scrollRef)} className={`chat-scroll px-3 ${splitLayout ? 'md:px-6' : ''} py-3 flex flex-col gap-3`}>
              {messagesLoading && <MessagesSkeleton />}
              {!messagesLoading && messages.length === 0 && (
                <div className="text-center text-xs font-mono text-[#A1A1AA] tracking-wider my-8">
                  {t('emptyChatHint')}
                </div>
              )}
              {!messagesLoading && messages.length > 0 && messageFilter.trim() && filteredMessages.length === 0 && (
                <div className="text-center text-xs font-mono text-[#A1A1AA] tracking-wider my-8" data-testid="chat-search-no-results">
                  {t('chatSearchNoResults')}
                </div>
              )}
              {!messagesLoading && filteredMessages.map((m) => (
                <Message
                  key={m.message_id}
                  msg={m}
                  isMine={getResolvedSenderId(m, user?.user_id) === user?.user_id}
                  myUserId={user?.user_id}
                  peerUserId={peer?.user_id}
                  privateKey={privateKey}
                  autoTranslate={translationEnabled && autoTranslate && !sameLangAsPeer}
                  translationEnabled={translationEnabled}
                  translationOnDevice={translationOnDevice}
                  serverTranslationAllowed={serverTranslationAllowed}
                  translateModelDownload={translateModelDownload}
                  targetLang={user?.language || 'en'}
                  sourceLang={peer?.language}
                  reads={reads}
                  participantsCount={activeConv?.participants?.length || 2}
                  readReceiptsEnabled={readReceiptsEnabled(user)}
                  quotedPreview={quoteByMessageId[m.message_id] || null}
                  onLongPress={onMessageLongPress}
                  onReactionToggle={onMessageReaction}
                  onPollVote={isGroup ? onPollVote : undefined}
                  pollVoting={pollVotingId === m.message_id}
                  searchQuery={chatSearchOpen ? messageFilter : ''}
                  isSearchMatch={!!messageFilter.trim() && searchMatchIds.includes(m.message_id)}
                  isActiveSearchMatch={m.message_id === activeSearchMatchId}
                  linkPreviewsEnabled={linkPreviewOn}
                  isGroup={isGroup}
                  groupMembers={activeConv?.members || []}
                />
              ))}
              {typingFrom && (
                <div className="text-[11px] font-mono text-[#A1A1AA] tracking-wider self-start" data-testid="typing-indicator">
                  {t('typingUser', { user: typingFrom })}
                </div>
              )}
            </div>

            {!canMessagePeer && !isGroup && (
              <div className="px-3 py-2 border-t border-[#27272A] text-[11px] text-[#FFD600] bg-[#FFD600]/10">
                {isRequestPendingPeer ? t('requestPendingChat') : t('cannotMessageNonMutual')}
              </div>
            )}
            {isGroup && !canComposeInChat && (
              <div className="px-3 py-2 border-t border-[#27272A] text-[11px] text-[#FFD600] bg-[#FFD600]/10" data-testid="group-posting-restricted">
                {t('groupPostingRestricted')}
              </div>
            )}
            <ReplyComposerBar quote={replyComposerQuote} onCancel={() => setReplyTo(null)} />
            {isGroup && mentionCandidates.length > 0 && (
              <GroupMentionPicker candidates={mentionCandidates} onPick={onPickMention} />
            )}
            <ComposerFormatBar
              disabled={!canComposeInChat}
              onBold={() => applyComposerFormat('bold')}
              onItalic={() => applyComposerFormat('italic')}
              onBulletList={() => applyComposerFormat('bullet')}
              onNumberedList={() => applyComposerFormat('numbered')}
            />
            <VideoRecordPreview stream={videoPreviewStream} />
            <form onSubmit={onSendText} className="chat-composer safe-bottom safe-x border-t border-[#27272A] px-2 md:px-3 py-2 flex items-end gap-2">
              <input ref={fileInputRef} type="file" accept="image/*,video/*" hidden onChange={onFileChange} data-testid="file-input" />
              <button type="button" onClick={onPickFile} disabled={uploadBusy || !canComposeInChat} data-testid="attach-button"
                className="w-11 h-11 rounded-md tac-border bg-[#121212] active:bg-[#1A1A1A] flex items-center justify-center shrink-0 disabled:opacity-40"
                title={uploadBusy ? t('uploadInProgress') : undefined}>
                <Paperclip size={18} />
              </button>
              <button
                type="button"
                onClick={() => setStickerPickerOpen(true)}
                disabled={uploadBusy || !canComposeInChat}
                data-testid="sticker-button"
                className="w-11 h-11 rounded-md tac-border bg-[#121212] active:bg-[#1A1A1A] flex items-center justify-center shrink-0 disabled:opacity-40"
                title={t('stickerGifPickerTitle')}
              >
                <Smiley size={18} />
              </button>
              {isGroup && (
                <button
                  type="button"
                  onClick={() => setPollModalOpen(true)}
                  disabled={uploadBusy || !canComposeInChat}
                  data-testid="poll-button"
                  className="w-11 h-11 rounded-md tac-border bg-[#121212] active:bg-[#1A1A1A] flex items-center justify-center shrink-0 disabled:opacity-40"
                  title={t('createPollTitle')}
                >
                  <ChartBar size={18} />
                </button>
              )}
              <button
                type="button"
                onClick={() => setLocationConfirmOpen(true)}
                disabled={uploadBusy || !canComposeInChat}
                data-testid="location-button"
                className="w-11 h-11 rounded-md tac-border bg-[#121212] active:bg-[#1A1A1A] flex items-center justify-center shrink-0 disabled:opacity-40"
                title={t('shareLocationTitle')}
              >
                <MapPin size={18} />
              </button>
              <button
                type="button"
                onClick={onVideoClick}
                onPointerDown={onVideoPointerDown}
                onPointerUp={onVideoPointerUp}
                onPointerCancel={onVideoPointerCancel}
                onContextMenu={(e) => e.preventDefault()}
                data-testid="video-note-button"
                disabled={!canComposeInChat || uploadBusy}
                title={t('videoHoldToRecord')}
                className={`w-11 h-11 rounded-md tac-border flex items-center justify-center shrink-0 select-none touch-none ${isVideoRecording ? 'bg-[#FF3B30] text-white' : 'bg-[#121212] active:bg-[#1A1A1A]'}`}
              >
                <FilmStrip size={18} />
              </button>
              <button
                type="button"
                onClick={onVoiceClick}
                onPointerDown={onVoicePointerDown}
                onPointerUp={onVoicePointerUp}
                onPointerCancel={onVoicePointerCancel}
                onContextMenu={(e) => e.preventDefault()}
                data-testid="voice-button"
                disabled={!canComposeInChat}
                title={t('voiceHoldToRecord')}
                className={`w-11 h-11 rounded-md tac-border flex items-center justify-center shrink-0 select-none touch-none ${isRecording ? 'bg-[#FF3B30] text-white' : 'bg-[#121212] active:bg-[#1A1A1A]'}`}
              >
                <Microphone size={18} />
              </button>
              <textarea
                ref={messageInputRef}
                value={draft}
                rows={1}
                onChange={(e) => onDraftChange(e.target.value)}
                onSelect={syncComposerCursor}
                onClick={syncComposerCursor}
                onKeyUp={syncComposerCursor}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    onSendText(e);
                  }
                }}
                onPaste={onComposerPaste}
                data-testid="message-input"
                placeholder={t('messagePlaceholder')}
                className="flex-1 min-w-0 min-h-11 max-h-32 px-3 py-2.5 text-base rounded-md resize-none overflow-y-auto"
                enterKeyHint="send"
                autoComplete="off"
                disabled={!canComposeInChat}
              />
              <button
                type="submit"
                data-testid="send-button"
                className="h-11 min-w-[44px] px-3 md:px-4 bg-[#00E5FF] text-black rounded-md font-medium text-sm flex items-center justify-center gap-2 active:brightness-90 transition disabled:opacity-40 shrink-0"
                disabled={!draft.trim() || !canComposeInChat}
                aria-label={t('send')}
              >
                <PaperPlaneTilt size={18} weight="fill" />
                <span className="send-label hidden sm:inline">{t('send').toUpperCase()}</span>
              </button>
            </form>
          </>
        )}
      </main>

      <ChatMediaGalleryModal
        open={mediaGalleryOpen}
        onClose={() => setMediaGalleryOpen(false)}
        items={imageMediaItems}
        captions={decryptedBodies}
        privateKey={privateKey}
        myUserId={user?.user_id}
        peerUserId={peer?.user_id}
        onJumpToMessage={(messageId) => setPendingScrollMessageId(messageId)}
      />

      <StickerGifPickerModal
        open={stickerPickerOpen}
        onClose={() => setStickerPickerOpen(false)}
        onPickSticker={sendBundledSticker}
        onPickGif={sendRemoteGif}
        gifSearchOn={gifSearchOn}
      />

      <CreatePollModal
        open={pollModalOpen}
        onClose={() => setPollModalOpen(false)}
        onCreate={onCreatePoll}
        busy={pollSending}
      />

      <GlobalMessageSearchModal
        open={globalSearchOpen}
        query={globalSearchQ}
        onQueryChange={setGlobalSearchQ}
        onClose={() => { setGlobalSearchOpen(false); setGlobalSearchQ(''); }}
        results={globalSearchResults}
        loading={globalSearchLoading}
        onSelect={handleGlobalSearchPick}
        formatGroupLabel={formatGroupConversationLabel}
      />

      {/* Search modal */}
      {searchOpen && (
        <div className="fixed inset-0 z-40 bg-black/70 backdrop-blur-xl flex items-start justify-center pt-24 px-4" onClick={() => setSearchOpen(false)}>
          <div className="w-full max-w-md bg-[#121212] tac-border rounded-md p-4 fade-up" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-mono text-xs tracking-[0.25em]">{t('newChatTitle')}</h3>
              <button onClick={() => setSearchOpen(false)} className="text-[#A1A1AA] hover:text-white" data-testid="close-search"><X size={16} /></button>
            </div>
            <p className="text-[11px] text-[#A1A1AA] mb-3 normal-case tracking-normal">
              {t('newChatHint')}
            </p>
            <div className="flex items-center gap-2 bg-[#1A1A1A] rounded-md px-3 py-2 tac-border">
              <MagnifyingGlass size={14} className="text-[#A1A1AA]" />
              <input value={searchQ} onChange={(e) => setSearchQ(e.target.value)} placeholder={t('searchUsername')}
                data-testid="search-input" className="bg-transparent flex-1 outline-none border-0 text-sm" autoFocus />
            </div>
            <div className="mt-3 max-h-80 overflow-y-auto">
              {searchQ.length < 2 && (
                <>
                  {acceptedContacts.length > 0 && (
                    <div className="mb-3">
                      <div className="px-1 pb-2 text-[10px] font-mono tracking-wider text-[#A1A1AA] uppercase">
                        {t('contacts')}
                      </div>
                      {acceptedContacts.map((c) => (
                        <button
                          key={c.user_id}
                          onClick={() => startConversation(c)}
                          data-testid={`contact-picker-${c.username}`}
                          className="w-full text-left px-3 py-2 rounded-md hover:bg-[#1A1A1A] flex items-center gap-3"
                        >
                          <Avatar user={c} size="sm" />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm truncate">{userPrimaryLabel(c)}</div>
                            <div className="text-[10px] font-mono text-[#A1A1AA]">
                              {c.display_name ? `${userHandle(c)} · ${t('tapToMessage')}` : t('tapToMessage')}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="px-3 py-4 text-center text-[11px] font-mono text-[#A1A1AA] tracking-wider">{t('type2chars')}</div>
                </>
              )}
              {searchResults.map((u) => {
                const isContact = myContacts.some(c => c.user_id === u.user_id && !c.blocked);
                const isMuted = myContacts.some(c => c.user_id === u.user_id && c.muted);
                const requestSent = outgoingRequests.some((r) => r.to_user_id === u.user_id);
                return (
                  <button key={u.user_id} onClick={() => startConversation(u)} data-testid={`search-result-${u.username}`}
                    className="w-full text-left px-3 py-2 rounded-md hover:bg-[#1A1A1A] flex items-center gap-3">
                    <Avatar user={u} size="sm" />
                    <div className="flex-1">
                      <div className="text-sm">{formatUserLabel(u)} {isContact && '✓'} {isMuted && `(${t('muted')})`}</div>
                      <div className="text-[10px] font-mono text-[#A1A1AA]">
                        {isContact ? t('tapToMessage') : requestSent ? t('requestSentLabel') : t('tapToAdd')}
                      </div>
                    </div>
                  </button>
                );
              })}
              {searchQ.length >= 2 && searchResults.length === 0 && (
                <div className="px-3 py-6 text-center text-[11px] font-mono text-[#A1A1AA] tracking-wider">{t('noUsersFound')}</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Incoming call ring */}
      {callState && callState.direction === 'incoming' && (
        <div
          className="fixed inset-0 z-[9999] bg-black/95 backdrop-blur-xl flex items-center justify-center safe-top safe-bottom pointer-events-auto"
          data-testid="incoming-call-overlay"
        >
          <div className="text-center px-6">
            <div className="mx-auto mb-4">
              <Avatar user={callState.peer} size="xl" />
            </div>
            <div className="text-lg font-medium">{userPrimaryLabel(callState.peer)}</div>
            <div className="text-xs font-mono text-[#A1A1AA] tracking-widest mt-1">{callState.mode === 'video' ? t('incomingVideoCall') : t('incomingAudioCall')}</div>
            <div className="mt-8 flex items-center justify-center gap-4">
              <button onClick={rejectCall} data-testid="call-reject-button" className="w-14 h-14 rounded-full bg-[#FF3B30] flex items-center justify-center hover:brightness-110">
                <Phone size={22} weight="fill" className="rotate-[135deg]" />
              </button>
              <button onClick={acceptCall} data-testid="call-accept-button" className="w-14 h-14 rounded-full bg-[#34C759] flex items-center justify-center hover:brightness-110">
                <Phone size={22} weight="fill" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Active call */}
      {callState && callState.direction !== 'incoming' && (
        <CallModal mode={callState.mode} direction={callState.direction === 'incoming-accepted' ? 'incoming' : 'outgoing'}
          peer={callState.peer} user={user} socket={socketRef.current} signal={callState.signal}
          onClose={() => setCallState(null)} />
      )}

      <ContactsModal
        open={contactsOpen}
        onClose={() => setContactsOpen(false)}
        contacts={myContacts}
        pendingRequests={pendingRequests}
        outgoingRequests={outgoingRequests}
        onAddUser={sendFriendRequest}
        onAccept={acceptRequest}
        onReject={rejectRequest}
        onMessage={async (c) => {
          try {
            const { data } = await api.post('/conversations', { peer_username: c.username });
            await loadConversations();
            goToConversation(data.conversation_id);
            setContactsOpen(false);
          } catch (e) {
            toast.error(e?.response?.data?.detail || t('couldNotOpenChat'));
          }
        }}
        onToggleBlock={toggleBlock}
        onToggleMute={toggleMute}
        onRemove={removeContact}
      />

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
      <ConfirmDialog
        open={!!confirmRemoveUid}
        title={t('deleteContact')}
        message={t('deleteContactConfirm')}
        danger
        onConfirm={confirmRemoveContact}
        onCancel={() => setConfirmRemoveUid(null)}
        testId="confirm-remove-contact"
      />
      <OnboardingCoach
        open={onboardingOpen}
        userId={user?.user_id}
        onComplete={() => setOnboardingOpen(false)}
      />
      <CreateGroupModal
        open={groupOpen}
        onClose={() => setGroupOpen(false)}
        myUserId={user?.user_id}
        contacts={myContacts}
        onCreated={(c) => { loadConversations(); goToConversation(c.conversation_id); }}
      />

      <BroadcastListsModal
        open={broadcastListsOpen}
        onClose={() => setBroadcastListsOpen(false)}
        contacts={myContacts}
        onSendList={(row) => {
          setBroadcastSendList(row);
          setBroadcastListsOpen(false);
          setBroadcastSendOpen(true);
        }}
      />

      <BroadcastSendModal
        open={broadcastSendOpen}
        onClose={() => { setBroadcastSendOpen(false); setBroadcastSendList(null); }}
        initialList={broadcastSendList}
        contacts={myContacts}
        conversations={conversations}
        user={user}
        privateKey={privateKey}
        refreshUser={refreshUser}
        loadConversations={loadConversations}
        onManageLists={() => {
          setBroadcastSendOpen(false);
          setBroadcastListsOpen(true);
        }}
      />

      <GroupManageModal
        open={groupManageOpen}
        onClose={() => setGroupManageOpen(false)}
        conversation={activeConv}
        myUserId={user?.user_id}
        myUser={user}
        contacts={myContacts}
        onUpdated={refreshActiveGroup}
        onLeave={() => { setGroupManageOpen(false); leaveChat(); loadConversations(); }}
      />

      <CreateGroupTopicModal
        open={topicModalOpen}
        onClose={() => setTopicModalOpen(false)}
        onCreate={createGroupTopic}
        busy={topicBusy}
      />

      <ConversationActionsSheet
        open={!!convActionsTarget}
        conversation={convActionsTarget}
        contact={convActionsTarget && !convActionsTarget.is_group
          ? myContacts.find((x) => x.user_id === convActionsTarget.peer?.user_id)
          : null}
        onClose={() => setConvActionsTarget(null)}
        onOpenMute={openMuteSheet}
        onBlock={toggleBlock}
        onPin={togglePin}
        onArchive={toggleArchive}
        onDelete={deleteConversation}
        onManageGroup={(conv) => {
          goToConversation(conv.conversation_id);
          setGroupManageOpen(true);
        }}
      />

      <MessageActionsSheet
        open={!!messageActionTarget}
        message={messageActionTarget}
        onClose={() => setMessageActionTarget(null)}
        onReply={onReplyToMessage}
        onForward={onForwardMessageRequest}
        onEdit={onEditMessageRequest}
        onDelete={onDeleteMessageRequest}
        onReact={onMessageReaction}
        showForward={canForwardMessage(messageActionTarget)}
        showEdit={canEditMessage(messageActionTarget, user?.user_id)}
        showDelete={canUnsendMessage(messageActionTarget, user?.user_id)}
        showReact={canReactToMessage(messageActionTarget)}
      />

      <ForwardMessageModal
        open={!!forwardTarget}
        preview={forwardPreview}
        targets={forwardDestinations}
        formatGroupLabel={formatGroupConversationLabel}
        onClose={() => setForwardTarget(null)}
        onConfirm={confirmForward}
        busy={forwardBusy}
      />

      <EditMessageModal
        open={!!editTarget}
        draft={editDraft}
        onDraftChange={setEditDraft}
        onSave={saveEditMessage}
        onClose={() => { setEditTarget(null); setEditDraft(''); }}
        saving={editSaving}
      />

      <ConfirmDialog
        open={locationConfirmOpen}
        title={t('shareLocationTitle')}
        message={t('shareLocationConfirm')}
        confirmLabel={t('shareLocationSubmit')}
        onConfirm={() => {
          setLocationConfirmOpen(false);
          sendLocation();
        }}
        onCancel={() => setLocationConfirmOpen(false)}
        testId="share-location-dialog"
      />

      <ConfirmDialog
        open={!!unsendTarget}
        title={t('messageUnsendTitle')}
        message={t('messageUnsendConfirm')}
        confirmLabel={t('messageActionDelete')}
        danger
        onConfirm={confirmUnsendMessage}
        onCancel={() => setUnsendTarget(null)}
        testId="unsend-message-dialog"
      />

      <ProfileContactSheet
        open={profileSheetOpen}
        peer={peer}
        contact={peerContact}
        onClose={() => setProfileSheetOpen(false)}
        onOpenMute={() => activeConv && openMuteSheet(activeConv)}
        onBlock={toggleBlock}
        onVerify={!isGroup && peer ? () => setVerifyOpen(true) : undefined}
      />

      <MuteDurationSheet
        open={!!muteSheetTarget}
        title={muteSheetTitle}
        muted={!!muteSheetTarget?.muted}
        mutedUntil={muteSheetTarget?.muted_until}
        onClose={() => setMuteSheetTarget(null)}
        onMute={(duration) => muteConversation(muteSheetTarget?.conversation_id, duration)}
        onUnmute={() => unmuteConversation(muteSheetTarget?.conversation_id)}
      />

      <VerifyHandshakeModal
        open={verifyOpen}
        onClose={() => setVerifyOpen(false)}
        me={user}
        peer={peer}
      />

      {storyGroup && (
        <StoryViewer
          group={storyGroup}
          me={user}
          privateKey={privateKey}
          onDeleted={storyGroup.onDeleted}
          onClose={() => setStoryGroup(null)}
        />
      )}
      {groupCallState && groupCallState.direction === 'incoming' && (
        <div
          className="fixed inset-0 z-[9999] bg-black/95 backdrop-blur-xl flex items-center justify-center safe-top safe-bottom pointer-events-auto"
          data-testid="incoming-group-call-overlay"
        >
          <div className="text-center px-6">
            <div className="w-24 h-24 rounded-md bg-[#1E2A38] mx-auto flex items-center justify-center mb-4">
              <UsersThree size={28} className="text-[#00E5FF]" weight="duotone" />
            </div>
            <div className="font-mono text-lg">{t('groupCall')}</div>
            <div className="text-xs font-mono text-[#A1A1AA] tracking-widest mt-1">
              {t('groupCallIncoming', { mode: groupCallState.mode.toUpperCase(), count: String(groupCallState.members.length + 1) })}
            </div>
            <div className="mt-8 flex items-center justify-center gap-4">
              <button onClick={rejectGroupCall} data-testid="group-call-reject" className="w-14 h-14 rounded-full bg-[#FF3B30] flex items-center justify-center hover:brightness-110">
                <Phone size={22} weight="fill" className="rotate-[135deg]" />
              </button>
              <button onClick={acceptGroupCall} data-testid="group-call-accept" className="w-14 h-14 rounded-full bg-[#34C759] flex items-center justify-center hover:brightness-110">
                <Phone size={22} weight="fill" />
              </button>
            </div>
          </div>
        </div>
      )}
      {groupCallState && groupCallState.direction !== 'incoming' && (
        groupCallState.mediaMode === 'sfu' ? (
          <GroupCallSfuModal
            mode={groupCallState.mode}
            direction={groupCallState.direction === 'incoming-accepted' ? 'incoming' : 'outgoing'}
            members={groupCallState.members}
            me={user}
            conversation={activeConv}
            conversationId={groupCallState.conversationId || activeId}
            socket={socketRef.current}
            signal={groupCallState.signal}
            onClose={() => setGroupCallState(null)}
          />
        ) : (
          <GroupCallModal
            mode={groupCallState.mode}
            direction={groupCallState.direction === 'incoming-accepted' ? 'incoming' : 'outgoing'}
            members={groupCallState.members}
            me={user}
            user={user}
            conversation={activeConv}
            conversationId={groupCallState.conversationId || activeId}
            socket={socketRef.current}
            signal={groupCallState.signal}
            onClose={() => setGroupCallState(null)}
          />
        )
      )}
    </div>
  );
}
