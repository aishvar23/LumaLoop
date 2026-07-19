/**
 * Per-card social surface for the native feed (likes + comments) — the RN
 * counterpart of web `src/social/CardSocialRail.tsx`.
 *
 * A compact action rail (a like/heart button with its count, and a comment
 * button with its count) plus an expandable comments sheet (the comment list +
 * a length-capped input with a live counter). It is mounted INSIDE the active
 * feed slide's bottom chrome but is a FEED-LAYER concern keyed by `cardId` — it
 * never branches on `templateType` and never touches the game renderer's logic
 * (CLAUDE.md §4/§6).
 *
 * Loading is ACTIVATION-GATED via the shared {@link useGameSocial}: only the
 * focused slide (`active`) fetches, and the load never blocks gameplay — on
 * failure it shows the zero/empty baseline. With no social config (no provider,
 * e.g. a directly-rendered slide in tests) it renders nothing, so the engine
 * stays auth-free.
 *
 * Copy is guardrail-safe (Design §7): plain social "likes"/"comments". Author
 * identity uses only the public profile fields (handle/display name) — no extra
 * PII. Styling shares the feed's design tokens (templates/tokens.ts).
 */
import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  colors,
  fontSize,
  fontWeight,
  radius,
  space,
} from '../feed/templates/tokens';
import { formatRelativeTime } from './relativeTime';
import { useSocialConfig } from './SocialContext';
import { useGameSocial } from './useGameSocial';
import { COMMENT_MAX_LENGTH, type GameComment } from './types';

export interface CardSocialRailProps {
  /** The card this rail is attached to. */
  cardId: string;
  /** The feed activation signal — true only for the focused slide. */
  active: boolean;
}

export default function CardSocialRail({ cardId, active }: CardSocialRailProps) {
  const config = useSocialConfig();
  if (!config) return null; // no provider → render nothing (engine stays auth-free).
  return <CardSocialRailInner cardId={cardId} active={active} config={config} />;
}

function CardSocialRailInner({
  cardId,
  active,
  config,
}: CardSocialRailProps & { config: NonNullable<ReturnType<typeof useSocialConfig>> }) {
  const { client, userId } = config;
  const social = useGameSocial({ client, cardId, userId, active });
  const [commentsOpen, setCommentsOpen] = useState(false);

  return (
    <View testID="card-social">
      <View style={styles.rail}>
        <Pressable
          testID="card-social-like"
          accessibilityRole="button"
          accessibilityState={{ selected: social.viewerLiked, disabled: !userId }}
          accessibilityLabel={social.viewerLiked ? 'Unlike this game' : 'Like this game'}
          disabled={!userId}
          onPress={social.toggleLike}
          style={[styles.btn, !userId && styles.btnDisabled]}
        >
          <Text style={[styles.heart, social.viewerLiked && styles.heartOn]}>
            {social.viewerLiked ? '♥' : '♡'}
          </Text>
          <Text style={styles.count} testID="card-social-like-count">
            {String(social.likeCount)}
          </Text>
        </Pressable>

        <Pressable
          testID="card-social-comment-toggle"
          accessibilityRole="button"
          accessibilityState={{ expanded: commentsOpen }}
          accessibilityLabel="Show comments"
          onPress={() => setCommentsOpen((open) => !open)}
          style={styles.btn}
        >
          <Text style={styles.bubble}>💬</Text>
          <Text style={styles.count} testID="card-social-comment-count">
            {String(social.comments.length)}
          </Text>
        </Pressable>
      </View>

      {commentsOpen && (
        <CommentsSheet
          comments={social.comments}
          canPost={userId !== null}
          loading={social.loading}
          onSubmit={social.submitComment}
          onDelete={social.removeComment}
        />
      )}
    </View>
  );
}

function CommentsSheet({
  comments,
  canPost,
  loading,
  onSubmit,
  onDelete,
}: {
  comments: GameComment[];
  canPost: boolean;
  loading: boolean;
  onSubmit: (body: string) => Promise<string | null>;
  onDelete: (commentId: string) => void;
}) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const remaining = COMMENT_MAX_LENGTH - draft.length;
  const trimmedEmpty = draft.trim().length === 0;

  async function handleSubmit() {
    if (submitting || trimmedEmpty) return;
    setSubmitting(true);
    setError(null);
    const err = await onSubmit(draft);
    setSubmitting(false);
    if (err) {
      setError(err);
      return;
    }
    setDraft('');
  }

  return (
    <View style={styles.sheet} testID="card-social-sheet">
      {canPost && (
        <View style={styles.form}>
          <TextInput
            testID="card-social-input"
            style={styles.input}
            value={draft}
            // Hard cap at the DB limit so the field can never exceed 280.
            maxLength={COMMENT_MAX_LENGTH}
            multiline
            placeholder="Add a comment…"
            placeholderTextColor={colors.textFaint}
            accessibilityLabel="Add a comment"
            onChangeText={(text) => {
              setDraft(text.slice(0, COMMENT_MAX_LENGTH));
              if (error) setError(null);
            }}
          />
          <View style={styles.formFoot}>
            <Text
              testID="card-social-counter"
              style={[styles.counter, remaining <= 0 && styles.counterMax]}
            >
              {String(remaining)}
            </Text>
            <Pressable
              testID="card-social-post"
              accessibilityRole="button"
              accessibilityLabel="Post comment"
              accessibilityState={{ disabled: submitting || trimmedEmpty }}
              disabled={submitting || trimmedEmpty}
              onPress={handleSubmit}
              style={[styles.post, (submitting || trimmedEmpty) && styles.postDisabled]}
            >
              <Text style={styles.postText}>{submitting ? 'Posting…' : 'Post'}</Text>
            </Pressable>
          </View>
          {error && (
            <Text testID="card-social-error" style={styles.error} accessibilityRole="alert">
              {error}
            </Text>
          )}
        </View>
      )}

      <ScrollView style={styles.list} testID="card-social-list">
        {loading && comments.length === 0 && (
          <Text style={styles.empty}>Loading comments…</Text>
        )}
        {!loading && comments.length === 0 && (
          <Text style={styles.empty}>No comments yet. Be the first.</Text>
        )}
        {comments.map((c) => (
          <View key={c.id} style={styles.comment} testID={`card-social-comment-${c.id}`}>
            <View style={styles.commentHead}>
              <Text style={styles.author}>
                {c.authorDisplayName ??
                  (c.authorHandle ? `@${c.authorHandle}` : 'Someone')}
              </Text>
              <Text style={styles.time}>{formatRelativeTime(c.createdAt)}</Text>
              {c.isOwn && (
                <Pressable
                  testID={`card-social-delete-${c.id}`}
                  accessibilityRole="button"
                  accessibilityLabel="Delete your comment"
                  onPress={() => onDelete(c.id)}
                >
                  <Text style={styles.delete}>Delete</Text>
                </Pressable>
              )}
            </View>
            <Text style={styles.body}>{c.body}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  rail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    marginTop: space.sm,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingVertical: space.xs,
    paddingHorizontal: space.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  btnDisabled: {
    opacity: 0.55,
  },
  heart: {
    fontSize: fontSize.md,
    color: colors.textMuted,
  },
  heartOn: {
    color: colors.danger,
  },
  bubble: {
    fontSize: fontSize.sm,
  },
  count: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  sheet: {
    marginTop: space.sm,
    maxHeight: 280,
    padding: space.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceRaised,
    gap: space.sm,
  },
  form: {
    gap: space.xs,
  },
  input: {
    minHeight: 44,
    padding: space.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: fontSize.sm,
  },
  formFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: space.md,
  },
  counter: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
  },
  counterMax: {
    color: colors.danger,
    fontWeight: fontWeight.medium,
  },
  post: {
    paddingVertical: space.xs,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  postDisabled: {
    opacity: 0.5,
  },
  postText: {
    color: colors.accentContrast,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  error: {
    color: colors.danger,
    fontSize: fontSize.sm,
  },
  list: {
    maxHeight: 200,
  },
  empty: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
  },
  comment: {
    marginBottom: space.sm,
    gap: 2,
  },
  commentHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  author: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  time: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
  },
  delete: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    textDecorationLine: 'underline',
  },
  body: {
    color: colors.text,
    fontSize: fontSize.sm,
  },
});
