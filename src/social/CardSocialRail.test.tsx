import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { AuthClient } from '../auth/authClient';
import CardSocialRail from './CardSocialRail';
import { SocialConfigProvider } from './SocialContext';

vi.mock('./gameSocialApi', () => ({
  fetchGameSocial: vi.fn(),
  toggleLike: vi.fn(),
  addComment: vi.fn(),
  deleteComment: vi.fn(),
}));

import { addComment, fetchGameSocial, toggleLike } from './gameSocialApi';

const fetchMock = vi.mocked(fetchGameSocial);
const toggleMock = vi.mocked(toggleLike);
const addMock = vi.mocked(addComment);

const client = {} as AuthClient;

function renderRail({
  active,
  userId = 'u1',
  withProvider = true,
}: {
  active: boolean;
  userId?: string | null;
  withProvider?: boolean;
}) {
  const rail = <CardSocialRail cardId="card-1" active={active} />;
  if (!withProvider) return render(rail);
  return render(
    <SocialConfigProvider value={{ client, userId }}>{rail}</SocialConfigProvider>,
  );
}

describe('CardSocialRail', () => {
  it('renders nothing without a social provider', () => {
    fetchMock.mockResolvedValue({ likeCount: 0, viewerLiked: false, comments: [] });
    renderRail({ active: true, withProvider: false });
    expect(screen.queryByTestId('card-social')).toBeNull();
  });

  it('does not fetch until active', async () => {
    fetchMock.mockResolvedValue({ likeCount: 0, viewerLiked: false, comments: [] });
    renderRail({ active: false });
    await Promise.resolve();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('loads and shows the like count + comment count on activation', async () => {
    fetchMock.mockResolvedValue({
      likeCount: 9,
      viewerLiked: false,
      comments: [
        {
          id: 'c1',
          body: 'x',
          createdAt: '2026-06-21T10:00:00.000Z',
          authorHandle: 'a',
          authorDisplayName: 'A',
          isOwn: false,
        },
      ],
    });
    renderRail({ active: true });
    await waitFor(() =>
      expect(screen.getByTestId('card-social-like-count').textContent).toBe('9'),
    );
    expect(screen.getByTestId('card-social-comment-count').textContent).toBe('1');
  });

  it('toggles like optimistically', async () => {
    fetchMock.mockResolvedValue({ likeCount: 1, viewerLiked: false, comments: [] });
    toggleMock.mockResolvedValue(true);
    renderRail({ active: true });
    await waitFor(() =>
      expect(screen.getByTestId('card-social-like-count').textContent).toBe('1'),
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('card-social-like'));
    });
    expect(screen.getByTestId('card-social-like-count').textContent).toBe('2');
    expect(screen.getByTestId('card-social-like')).toHaveAttribute('aria-pressed', 'true');
  });

  it('disables the like button when signed out', async () => {
    fetchMock.mockResolvedValue({ likeCount: 3, viewerLiked: false, comments: [] });
    renderRail({ active: true, userId: null });
    await waitFor(() =>
      expect(screen.getByTestId('card-social-like-count').textContent).toBe('3'),
    );
    expect(screen.getByTestId('card-social-like')).toBeDisabled();
  });

  it('caps the comment input at 280 chars and shows a live counter', async () => {
    fetchMock.mockResolvedValue({ likeCount: 0, viewerLiked: false, comments: [] });
    renderRail({ active: true });
    await waitFor(() => expect(screen.getByTestId('card-social')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('card-social-comment-toggle'));
    const input = screen.getByTestId('card-social-input') as HTMLTextAreaElement;

    fireEvent.change(input, { target: { value: 'a'.repeat(300) } });
    expect(input.value.length).toBe(280);
    expect(screen.getByTestId('card-social-counter').textContent).toBe('0');
  });

  it('posts a comment and clears the input on success', async () => {
    fetchMock.mockResolvedValue({ likeCount: 0, viewerLiked: false, comments: [] });
    addMock.mockResolvedValue({
      comment: {
        id: 'c1',
        body: 'hello',
        createdAt: '2026-06-21T10:00:00.000Z',
        authorHandle: 'ash',
        authorDisplayName: 'Ash',
        isOwn: true,
      },
      error: null,
    });
    renderRail({ active: true });
    await waitFor(() => expect(screen.getByTestId('card-social')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('card-social-comment-toggle'));
    const input = screen.getByTestId('card-social-input') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'hello' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('card-social-post'));
    });
    await waitFor(() => expect(input.value).toBe(''));
    expect(screen.getByTestId('card-social-comment-count').textContent).toBe('1');
  });

  it('shows a friendly error when the post fails', async () => {
    fetchMock.mockResolvedValue({ likeCount: 0, viewerLiked: false, comments: [] });
    addMock.mockResolvedValue({ comment: null, error: 'Could not post your comment. Try again.' });
    renderRail({ active: true });
    await waitFor(() => expect(screen.getByTestId('card-social')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('card-social-comment-toggle'));
    fireEvent.change(screen.getByTestId('card-social-input'), {
      target: { value: 'hello' },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('card-social-post'));
    });
    await waitFor(() => expect(screen.getByTestId('card-social-error')).toBeInTheDocument());
  });
});
