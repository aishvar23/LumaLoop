import {
  createContext,
  useContext,
  type ReactNode,
} from 'react';

import {
  categoryAccent,
  FALLBACK_CATEGORY_ACCENT,
  type CategoryAccent,
} from './tokens';

const GameThemeContext = createContext<CategoryAccent>(
  FALLBACK_CATEGORY_ACCENT,
);

export function GameThemeProvider({
  category,
  children,
}: {
  category?: string;
  children: ReactNode;
}) {
  return (
    <GameThemeContext.Provider value={categoryAccent(category)}>
      {children}
    </GameThemeContext.Provider>
  );
}

/**
 * Shared category palette for native game renderers. The feed supplies the
 * category once; templates consume semantic roles instead of branching on a
 * category or hard-coding their own colors.
 */
export function useGameTheme(): CategoryAccent {
  return useContext(GameThemeContext);
}
