import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import { SKDM_MESSAGE_TYPE } from '../lib/signal/constants';
import { STATUS_SKDM_MESSAGE_TYPE, processIncomingStatusSkdmMessage } from '../lib/signal/statuses';
import { decryptMessageBody } from '../lib/signal/migration';
import { processIncomingSkdmMessage } from '../lib/signal/groupMessages';
import { readReceiptsEnabled } from '../lib/privacySettings';
import { isMessageDeleted } from '../lib/messageDelete';
import { filterMessagesForSearch, searchMatchIds } from '../lib/chatSearch';

export function useChatMessages({
  activeId,
  user,
  peer,
  privateKey,
  isGroup,
  activeConv,
  activeTopicId,
}) {
  const [messages, setMessages] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [reads, setReads] = useState([]);
  const [decryptedBodies, setDecryptedBodies] = useState({});
  const [messageFilter, setMessageFilter] = useState('');
  const userNearBottomRef = useRef(true);

  useEffect(() => {
    if (!user?.user_id || messages.length === 0) return;
    let cancelled = false;
    (async () => {
      const next = {};
      for (const m of messages) {
        if (isMessageDeleted(m)) continue;
        try {
          next[m.message_id] = await decryptMessageBody(m, {
            myUserId: user.user_id,
            peerUserId: peer?.user_id,
            privateKey,
          });
        } catch {
          /* skip undecryptable */
        }
      }
      if (!cancelled) {
        setDecryptedBodies((prev) => ({ ...prev, ...next }));
      }
    })();
    return () => { cancelled = true; };
  }, [messages, privateKey, user?.user_id, peer?.user_id]);

  const searchContext = useMemo(
    () => ({ user, peer, isGroup, activeConv }),
    [user, peer, isGroup, activeConv],
  );

  const filteredMessages = useMemo(
    () => filterMessagesForSearch(messages, messageFilter, decryptedBodies, searchContext),
    [messages, messageFilter, decryptedBodies, searchContext],
  );

  const matchIds = useMemo(
    () => searchMatchIds(messages, messageFilter, decryptedBodies, searchContext),
    [messages, messageFilter, decryptedBodies, searchContext],
  );

  useEffect(() => {
    if (!activeId) {
      setMessageFilter('');
      setMessages([]);
      setReads([]);
      setMessagesLoading(false);
      return;
    }
    setMessagesLoading(true);
    (async () => {
      try {
        const topicQuery = isGroup && activeTopicId
          ? `?topic_id=${encodeURIComponent(activeTopicId)}`
          : '';
        const { data } = await api.get(`/conversations/${activeId}/messages${topicQuery}`);
        const visible = [];
        for (const msg of data) {
          if (msg?.message_type === SKDM_MESSAGE_TYPE) {
            processIncomingSkdmMessage(msg, {
              myUserId: user?.user_id,
              peerUserId: peer?.user_id,
            }).catch(() => {});
          } else if (msg?.message_type === STATUS_SKDM_MESSAGE_TYPE) {
            processIncomingStatusSkdmMessage(msg, {
              myUserId: user?.user_id,
              peerUserId: msg.sender_id !== user?.user_id ? msg.sender_id : peer?.user_id,
            }).catch(() => {});
          } else {
            visible.push(msg);
          }
        }
        setMessages(visible);
        const { data: rs } = await api.get(`/conversations/${activeId}/reads`);
        setReads(rs);
        if (readReceiptsEnabled(user)) {
          try { await api.post('/messages/read', { conversation_id: activeId }); } catch {}
        }
      } catch {}
      finally { setMessagesLoading(false); }
    })();
  }, [activeId, activeTopicId, isGroup, user?.user_id, peer?.user_id]);

  useEffect(() => {
    if (!activeId || messages.length === 0) return;
    const last = messages[messages.length - 1];
    if (last.sender_id !== user?.user_id && readReceiptsEnabled(user)) {
      api.post('/messages/read', { conversation_id: activeId, up_to_message_id: last.message_id }).catch(() => {});
    }
  }, [messages, activeId, user]);

  const onMessagesScroll = (scrollRef) => {
    const el = scrollRef?.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    userNearBottomRef.current = dist < 80;
  };

  return {
    messages,
    setMessages,
    messagesLoading,
    reads,
    setReads,
    decryptedBodies,
    messageFilter,
    setMessageFilter,
    filteredMessages,
    searchMatchIds: matchIds,
    userNearBottomRef,
    onMessagesScroll,
  };
}