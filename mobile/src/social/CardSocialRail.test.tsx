import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import type { AuthClient } from '../auth/authClient';
import CardSocialRail from './CardSocialRail';
import { SocialConfigProvider } from './SocialContext';

jest.mock('./gameSocialApi', () => ({
  fetchGameSocial: jest.fn(),
  toggleLike: jest.fn(),
  addComment: jest.fn(),
  deleteComment: jest.fn(),
}));

import { addComment, fetchGameSocial, toggleLike } from './gameSocialApi';

const fetchMock = fetchGameSocial as jest.MockedFunction<typeof fetchGameSocial>;
const toggleMock = toggleLike as jest.MockedFunction<typeof toggleLike>;
const addMock = addComment as jest.MockedFunction<typeof addComment>;

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

beforeEach(() => {
  jest.clearAllMocks();
});

describe('CardSocialRail (RN)', () => {
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
      expect(screen.getByTestId('card-social-like-count').props.children).toBe('9'),
    );
    expect(screen.getByTestId('card-social-comment-count').props.children).toBe('1');
  });

  it('toggles like optimistically', async () => {
    fetchMock.mockResolvedValue({ likeCount: 1, viewerLiked: false, comments: [] });
    toggleMock.mockResolvedValue(true);
    renderRail({ active: true });
    await waitFor(() =>
      expect(screen.getByTestId('card-social-like-count').props.children).toBe('1'),
    );
    await act(async () => {
      fireEvent.press(screen.getByTestId('card-social-like'));
    });
    expect(screen.getByTestId('card-social-like-count').props.children).toBe('2');
  });

  it('disables the like button when signed out', async () => {
    fetchMock.mockResolvedValue({ likeCount: 3, viewerLiked: false, comments: [] });
    renderRail({ active: true, userId: null });
    await waitFor(() =>
      expect(screen.getByTestId('card-social-like-count').props.children).toBe('3'),
    );
    expect(screen.getByTestId('card-social-like').props.accessibilityState.disabled).toBe(true);
  });

  it('caps the comment input at 280 chars and shows a live counter', async () => {
    fetchMock.mockResolvedValue({ likeCount: 0, viewerLiked: false, comments: [] });
    renderRail({ active: true });
    await waitFor(() => expect(screen.getByTestId('card-social')).toBeTruthy());

    fireEvent.press(screen.getByTestId('card-social-comment-toggle'));
    const input = screen.getByTestId('card-social-input');

    fireEvent.changeText(input, 'a'.repeat(300));
    expect(screen.getByTestId('card-social-counter').props.children).toBe('0');
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
    await waitFor(() => expect(screen.getByTestId('card-social')).toBeTruthy());

    fireEvent.press(screen.getByTestId('card-social-comment-toggle'));
    fireEvent.changeText(screen.getByTestId('card-social-input'), 'hello');
    await act(async () => {
      fireEvent.press(screen.getByTestId('card-social-post'));
    });
    await waitFor(() =>
      expect(screen.getByTestId('card-social-comment-count').props.children).toBe('1'),
    );
  });

  it('shows a friendly error when the post fails', async () => {
    fetchMock.mockResolvedValue({ likeCount: 0, viewerLiked: false, comments: [] });
    addMock.mockResolvedValue({
      comment: null,
      error: 'Could not post your comment. Try again.',
    });
    renderRail({ active: true });
    await waitFor(() => expect(screen.getByTestId('card-social')).toBeTruthy());

    fireEvent.press(screen.getByTestId('card-social-comment-toggle'));
    fireEvent.changeText(screen.getByTestId('card-social-input'), 'hello');
    await act(async () => {
      fireEvent.press(screen.getByTestId('card-social-post'));
    });
    await waitFor(() => expect(screen.getByTestId('card-social-error')).toBeTruthy());
  });
});
