import StartScreen from '../ui/StartScreen';

/**
 * App root. For the scaffold it renders only the Start screen.
 * Routing (`/` session + `/c/:cardId` deep link, Technical Design §12) and the
 * session controller are wired up in later tasks.
 */
export default function App() {
  return <StartScreen />;
}
