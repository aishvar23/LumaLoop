/**
 * Feed route container (docs/FEED_DIRECTION.md §2 / §3.6, Azure DevOps #107).
 *
 * The endless swipe feed is now the DEFAULT app surface: `/` mounts this thin
 * wrapper, which renders the {@link FeedScreen} with the one-time first-run data
 * notice layered over it. The notice shows once (first visit), then dismisses for
 * good (§3.6) — afterwards the feed is the only surface.
 *
 * Routing stays routing-only (CLAUDE.md §4): this container owns no feed
 * progression — {@link FeedScreen} + {@link useFeedController} own the deck and
 * active card; the notice owns only its own dismissal state.
 */
import FeedScreen from './FeedScreen';
import FirstRunNotice from './FirstRunNotice';

export default function FeedRoute() {
  return (
    <>
      <FeedScreen />
      <FirstRunNotice />
    </>
  );
}
