/**
 * Pure client-side validation for a comment body, mirroring the DB CHECK
 * (`char_length(body) between 1 and 280`). We trim leading/trailing whitespace
 * and reject empty/whitespace-only and over-cap bodies BEFORE hitting the
 * network, so the user gets an immediate, friendly error instead of a DB error.
 *
 * Pure + dependency-free so it is trivially unit-testable and shared by both the
 * data layer ({@link addComment}) and the UI's live character counter.
 */
import { COMMENT_MAX_LENGTH } from './types';

export interface ValidatedComment {
  /** The trimmed, ready-to-send body when valid; null otherwise. */
  body: string | null;
  /** A friendly, user-facing error message when invalid; null when valid. */
  error: string | null;
}

/**
 * Validate + normalise a raw comment body. Trims first, then enforces 1..280.
 * Returns the trimmed body on success, or a friendly error on failure.
 */
export function validateCommentBody(raw: string): ValidatedComment {
  const body = raw.trim();
  if (body.length === 0) {
    return { body: null, error: 'Write something before posting.' };
  }
  if (body.length > COMMENT_MAX_LENGTH) {
    return {
      body: null,
      error: `Comments are limited to ${COMMENT_MAX_LENGTH} characters.`,
    };
  }
  return { body, error: null };
}
