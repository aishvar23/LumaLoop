/**
 * React hook owning one card's social state (likes + comments) in the feed.
 *
 * Loads on ACTIVATION: the load fires only once the slide is `active` (the
 * feed's focused-slide signal), so the feed's pre-mounted off-screen neighbours
 * don't all fetch. It refetches when the active card changes (the hook is keyed
 * per slide; activation flips false→true as the user swipes to it). The load is
 * best-effort and never blocks gameplay — on failure the state stays at the
 * empty/zero baseline.
 *
 * Mutations are OPTIMISTIC: a like toggle updates the count + flag immediately
 * and reverts if the write fails; a posted comment is prepended on success.
 * Deleting an own comment removes it optimistically and reverts on failure.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import type { AuthClient } from '../auth/authClient';
import {
  addComment as addCommentApi,
  deleteComment as deleteCommentApi,
  fetchGameSocial,
  toggleLike as toggleLikeApi,
} from './gameSocialApi';
import { validateCommentBody } from './commentValidation';
import { EMPTY_SOCIAL, type GameComment, type GameSocial } from './types';

export interface UseGameSocialOptions {
  client: AuthClient;
  cardId: string;
  /** The signed-in user's id, or null when signed out (read-only / no writes). */
  userId: string | null;
  /** The feed activation signal — load only once this is true. */
  active: boolean;
}

export interface UseGameSocialState extends GameSocial {
  /** True while the initial activation load is in flight. */
  loading: boolean;
  /** Toggle the viewer's like (optimistic; reverts on failure). No-op signed out. */
  toggleLike: () => void;
  /**
   * Post a comment. Validates 1..280 client-side; returns a friendly error
   * string on invalid/failed input, or null on success (the comment is added).
   */
  submitComment: (body: string) => Promise<string | null>;
  /** Delete one of the viewer's own comments (optimistic; reverts on failure). */
  removeComment: (commentId: string) => void;
}

export function useGameSocial({
  client,
  cardId,
  userId,
  active,
}: UseGameSocialOptions): UseGameSocialState {
  const [social, setSocial] = useState<GameSocial>(EMPTY_SOCIAL);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Refs so the stable callbacks always read the latest values without
  // re-binding (mirrors the file convention used across the feed layer).
  const clientRef = useRef(client);
  clientRef.current = client;
  const cardIdRef = useRef(cardId);
  cardIdRef.current = cardId;
  const userIdRef = useRef(userId);
  userIdRef.current = userId;
  const socialRef = useRef(social);
  socialRef.current = social;

  // Load once on first activation. Off-screen (never-active) slides never fetch.
  useEffect(() => {
    if (!active || loaded) return;
    let alive = true;
    setLoading(true);
    void (async () => {
      const next = await fetchGameSocial(clientRef.current, cardIdRef.current, userIdRef.current);
      if (!alive) return;
      setSocial(next);
      setLoading(false);
      setLoaded(true);
    })();
    return () => {
      alive = false;
    };
  }, [active, loaded]);

  const toggleLike = useCallback(() => {
    const uid = userIdRef.current;
    if (!uid) return; // signed out — read-only.
    const current = socialRef.current;
    const nextLiked = !current.viewerLiked;
    // Optimistic: flip the flag + adjust the count immediately.
    const optimistic: GameSocial = {
      ...current,
      viewerLiked: nextLiked,
      likeCount: Math.max(0, current.likeCount + (nextLiked ? 1 : -1)),
    };
    setSocial(optimistic);
    void (async () => {
      const ok = await toggleLikeApi(clientRef.current, cardIdRef.current, uid, nextLiked);
      if (!ok) setSocial(current); // revert to the pre-toggle snapshot.
    })();
  }, []);

  const submitComment = useCallback(async (body: string): Promise<string | null> => {
    const uid = userIdRef.current;
    if (!uid) return 'Sign in to comment.';
    // Validate client-side first for an immediate friendly error.
    const { error: invalid } = validateCommentBody(body);
    if (invalid) return invalid;
    const result = await addCommentApi(clientRef.current, cardIdRef.current, uid, body);
    if (result.error || !result.comment) {
      return result.error ?? 'Could not post your comment. Try again.';
    }
    const added = result.comment;
    setSocial((prev) => ({ ...prev, comments: [added, ...prev.comments] }));
    return null;
  }, []);

  const removeComment = useCallback((commentId: string) => {
    const uid = userIdRef.current;
    if (!uid) return;
    const current = socialRef.current;
    const target = current.comments.find((c: GameComment) => c.id === commentId);
    if (!target || !target.isOwn) return; // only own comments are deletable.
    // Optimistic removal.
    setSocial({
      ...current,
      comments: current.comments.filter((c: GameComment) => c.id !== commentId),
    });
    void (async () => {
      const ok = await deleteCommentApi(clientRef.current, commentId, uid);
      if (!ok) setSocial(current); // revert.
    })();
  }, []);

  return { ...social, loading, toggleLike, submitComment, removeComment };
}
