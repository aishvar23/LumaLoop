import type { SignalSetCard, SignalTile } from '../../cards/types';
import type { ResolutionType } from '../contract';

export type SignalSetSignals = {
  selected_count: number;
  same_dimensions: number;
  different_dimensions: number;
  valid_trio: boolean;
};

export type SignalSetResult = {
  isCorrect: boolean;
  resolutionType: Extract<ResolutionType, 'correct' | 'incorrect'>;
  signals: SignalSetSignals;
};

type SignalDimension = keyof Pick<SignalTile, 'shape' | 'fill' | 'count'>;

const DIMENSIONS: readonly SignalDimension[] = ['shape', 'fill', 'count'];

export function isValidSignalTrio(tiles: ReadonlyArray<SignalTile>): boolean {
  if (tiles.length !== 3) return false;
  return DIMENSIONS.every((dimension) => {
    const distinct = new Set(tiles.map((tile) => tile[dimension])).size;
    return distinct === 1 || distinct === 3;
  });
}

export function evaluateSignalSet(
  answer: Pick<SignalSetCard['config'], 'tiles'>,
  selectedIds: ReadonlyArray<string>,
): SignalSetResult {
  const byId = new Map(answer.tiles.map((tile) => [tile.id, tile]));
  const selected = selectedIds
    .map((id) => byId.get(id))
    .filter((tile): tile is SignalTile => tile !== undefined);
  const uniqueSelection = new Set(selectedIds).size === selectedIds.length;
  let sameDimensions = 0;
  let differentDimensions = 0;

  if (selected.length === 3 && uniqueSelection) {
    for (const dimension of DIMENSIONS) {
      const distinct = new Set(selected.map((tile) => tile[dimension])).size;
      if (distinct === 1) sameDimensions += 1;
      if (distinct === 3) differentDimensions += 1;
    }
  }

  const isCorrect =
    selected.length === 3 && uniqueSelection && isValidSignalTrio(selected);
  return {
    isCorrect,
    resolutionType: isCorrect ? 'correct' : 'incorrect',
    signals: {
      selected_count: selected.length,
      same_dimensions: sameDimensions,
      different_dimensions: differentDimensions,
      valid_trio: isCorrect,
    },
  };
}
