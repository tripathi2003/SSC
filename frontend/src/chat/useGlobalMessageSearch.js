import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { visibleConversations } from '../lib/contactFilters';
import {
  GLOBAL_SEARCH_CONCURRENCY,
  MIN_GLOBAL_SEARCH_LENGTH,
  filterVisibleChatMessages,
  mapWithConcurrency,
  mergeGlobalSearchResults,
  searchGlobalInConversation,
} from '../lib/globalMessageSearch';
import {
  buildDecryptedBodiesMap,
  ingestMessagesPlaintext,
} from '../lib/messageIngest';

const CACHE_TTL_MS = 120_000;

export function useGlobalMessageSearch({
  open,
  query,
  conversations,
  myContacts,
  user,
  privateKey,
}) {
  const cacheRef = useRef({});
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || query.trim().length < MIN_GLOBAL_SEARCH_LENGTH || !user?.user_id) {
      setResults([]);
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const visible = visibleConversations(conversations, myContacts);
        const now = Date.now();
        const hitsByConv = await mapWithConcurrency(
          visible,
          GLOBAL_SEARCH_CONCURRENCY,
          async (conversation) => {
            if (cancelled) return [];
            const convId = conversation.conversation_id;
            const cached = cacheRef.current[convId];
            let messages;
            let bodies;
            if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
              messages = cached.messages;
              bodies = cached.bodies;
            } else {
              const { data } = await api.get(`/conversations/${convId}/messages`);
              messages = filterVisibleChatMessages(data);
              await ingestMessagesPlaintext(messages, {
                myUserId: user.user_id,
                peerUserId: conversation.is_group ? null : conversation.peer?.user_id,
                privateKey,
              });
              bodies = buildDecryptedBodiesMap(messages, user.user_id);
              cacheRef.current[convId] = { messages, bodies, fetchedAt: Date.now() };
            }
            return searchGlobalInConversation({
              conversation,
              messages,
              decryptedBodies: bodies,
              query,
              user,
            });
          },
        );
        if (!cancelled) {
          setResults(mergeGlobalSearchResults(hitsByConv));
        }
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, query, conversations, myContacts, user, privateKey]);

  const clearCache = () => {
    cacheRef.current = {};
  };

  return { results, loading, clearCache };
}