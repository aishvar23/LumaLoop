import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { AuthClient } from '../auth/authClient';
import { useGameSocial } from './useGameSocial';

// Mock the data layer so we drive the hook deterministically.
vi.mock('./gameSocialApi', () => ({
  fetchGameSocial: vi.fn(),
  toggleLike: vi.fn(),
  addComment: vi.fn(),
  deleteComment: vi.fn(),
}));

import {
  addComment,
  deleteComment,
  fetchGameSocial,
  toggleLike,
} from './gameSocialApi';

const fetchMock = vi.mocked(fetchGameSocial);
const toggleMock = vi.mocked(toggleLike);
const addMock = vi.mocked(addComment);
const deleteMock = vi.mocked(deleteComment);

const client = {} as AuthClient;

function Harness({
  cardId = 'card-1',
  userId = 'u1',
  active,
}: {
  cardId?: string;
  userId?: string | null;
  active: boolean;
}) {
  const s = useGameSocial({ client, cardId, userId, active });
  return (
    <div>
      <span data-testid="count">{s.likeCount}</span>
      <span data-testid="liked">{String(s.viewerLiked)}</span>
      <span data-testid="comments">{s.comments.length}</span>
      <button data-testid="like" onClick={s.toggleLike}>
        like
      </button>
      <button data-testid="add" onClick={() => void s.submitComment('hello')}>
        add
      </button>
      <button
        data-testid="del"
        onClick={() => s.comments[0] && s.removeComment(s.comments[0].id)}
      >
        del
      </button>
    </div>
  );
}

describe('useGameSocial', () => {
  it('does NOT fetch until the slide is active', async () => {
    fetchMock.mockResolvedValue({ likeCount: 0, viewerLiked: false, comments: [] });
    render(<Harness active={false} />);
    // Give any (incorrect) async load a tick.
    await Promise.resolve();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetches once on activation and shows the loaded state', async () => {
    fetchMock.mockResolvedValue({ likeCount: 5, viewerLiked: true, comments: [] });
    render(<Harness active />);
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('5'));
    expect(screen.getByTestId('liked').textContent).toBe('true');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('optimistically toggles like and persists on success', async () => {
    fetchMock.mockResolvedValue({ likeCount: 2, viewerLiked: false, comments: [] });
    toggleMock.mockResolvedValue(true);
    render(<Harness active />);
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('2'));

    await act(async () => {
      screen.getByTestId('like').click();
    });
    expect(screen.getByTestId('liked').textContent).toBe('true');
    expect(screen.getByTestId('count').textContent).toBe('3');
    expect(toggleMock).toHaveBeenCalledWith(client, 'card-1', 'u1', true);
  });

  it('reverts the optimistic like when the write fails', async () => {
    fetchMock.mockResolvedValue({ likeCount: 2, viewerLiked: false, comments: [] });
    toggleMock.mockResolvedValue(false);
    render(<Harness active />);
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('2'));

    await act(async () => {
      screen.getByTestId('like').click();
    });
    await waitFor(() => expect(screen.getByTestId('liked').textContent).toBe('false'));
    expect(screen.getByTestId('count').textContent).toBe('2');
  });

  it('prepends a posted comment on success', async () => {
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
    render(<Harness active />);
    await waitFor(() => expect(screen.getByTestId('comments').textContent).toBe('0'));

    await act(async () => {
      screen.getByTestId('add').click();
    });
    await waitFor(() => expect(screen.getByTestId('comments').textContent).toBe('1'));
  });

  it('optimistically removes an own comment', async () => {
    fetchMock.mockResolvedValue({
      likeCount: 0,
      viewerLiked: false,
      comments: [
        {
          id: 'c1',
          body: 'mine',
          createdAt: '2026-06-21T10:00:00.000Z',
          authorHandle: 'ash',
          authorDisplayName: 'Ash',
          isOwn: true,
        },
      ],
    });
    deleteMock.mockResolvedValue(true);
    render(<Harness active />);
    await waitFor(() => expect(screen.getByTestId('comments').textContent).toBe('1'));

    await act(async () => {
      screen.getByTestId('del').click();
    });
    expect(screen.getByTestId('comments').textContent).toBe('0');
    expect(deleteMock).toHaveBeenCalledWith(client, 'c1', 'u1');
  });
});
