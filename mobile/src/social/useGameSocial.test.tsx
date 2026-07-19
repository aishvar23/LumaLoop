import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Pressable, Text, View } from 'react-native';

import type { AuthClient } from '../auth/authClient';
import { useGameSocial } from './useGameSocial';

jest.mock('./gameSocialApi', () => ({
  fetchGameSocial: jest.fn(),
  toggleLike: jest.fn(),
  addComment: jest.fn(),
  deleteComment: jest.fn(),
}));

import {
  addComment,
  deleteComment,
  fetchGameSocial,
  toggleLike,
} from './gameSocialApi';

const fetchMock = fetchGameSocial as jest.MockedFunction<typeof fetchGameSocial>;
const toggleMock = toggleLike as jest.MockedFunction<typeof toggleLike>;
const addMock = addComment as jest.MockedFunction<typeof addComment>;
const deleteMock = deleteComment as jest.MockedFunction<typeof deleteComment>;

const client = {} as AuthClient;

function Harness({
  active,
  userId = 'u1',
}: {
  active: boolean;
  userId?: string | null;
}) {
  const s = useGameSocial({ client, cardId: 'card-1', userId, active });
  return (
    <View>
      <Text testID="count">{String(s.likeCount)}</Text>
      <Text testID="liked">{String(s.viewerLiked)}</Text>
      <Text testID="comments">{String(s.comments.length)}</Text>
      <Pressable testID="like" onPress={s.toggleLike}>
        <Text>like</Text>
      </Pressable>
      <Pressable testID="add" onPress={() => void s.submitComment('hello')}>
        <Text>add</Text>
      </Pressable>
      <Pressable
        testID="del"
        onPress={() => s.comments[0] && s.removeComment(s.comments[0].id)}
      >
        <Text>del</Text>
      </Pressable>
    </View>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('useGameSocial (RN)', () => {
  it('does not fetch until the slide is active', async () => {
    fetchMock.mockResolvedValue({ likeCount: 0, viewerLiked: false, comments: [] });
    render(<Harness active={false} />);
    await Promise.resolve();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetches once on activation and shows the loaded state', async () => {
    fetchMock.mockResolvedValue({ likeCount: 5, viewerLiked: true, comments: [] });
    render(<Harness active />);
    await waitFor(() => expect(screen.getByTestId('count').props.children).toBe('5'));
    expect(screen.getByTestId('liked').props.children).toBe('true');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('optimistically toggles like and persists on success', async () => {
    fetchMock.mockResolvedValue({ likeCount: 2, viewerLiked: false, comments: [] });
    toggleMock.mockResolvedValue(true);
    render(<Harness active />);
    await waitFor(() => expect(screen.getByTestId('count').props.children).toBe('2'));

    await act(async () => {
      fireEvent.press(screen.getByTestId('like'));
    });
    expect(screen.getByTestId('liked').props.children).toBe('true');
    expect(screen.getByTestId('count').props.children).toBe('3');
    expect(toggleMock).toHaveBeenCalledWith(client, 'card-1', 'u1', true);
  });

  it('reverts the optimistic like when the write fails', async () => {
    fetchMock.mockResolvedValue({ likeCount: 2, viewerLiked: false, comments: [] });
    toggleMock.mockResolvedValue(false);
    render(<Harness active />);
    await waitFor(() => expect(screen.getByTestId('count').props.children).toBe('2'));

    await act(async () => {
      fireEvent.press(screen.getByTestId('like'));
    });
    await waitFor(() => expect(screen.getByTestId('liked').props.children).toBe('false'));
    expect(screen.getByTestId('count').props.children).toBe('2');
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
    await waitFor(() => expect(screen.getByTestId('comments').props.children).toBe('0'));

    await act(async () => {
      fireEvent.press(screen.getByTestId('add'));
    });
    await waitFor(() => expect(screen.getByTestId('comments').props.children).toBe('1'));
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
    await waitFor(() => expect(screen.getByTestId('comments').props.children).toBe('1'));

    await act(async () => {
      fireEvent.press(screen.getByTestId('del'));
    });
    expect(screen.getByTestId('comments').props.children).toBe('0');
    expect(deleteMock).toHaveBeenCalledWith(client, 'c1', 'u1');
  });
});
