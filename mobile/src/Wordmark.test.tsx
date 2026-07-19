import { render, screen } from '@testing-library/react-native';

import Wordmark from './Wordmark';

describe('Wordmark (RN)', () => {
  it('exposes the accessible name "Witzy"', () => {
    render(<Wordmark fontSize={24} />);
    expect(screen.getByLabelText('Witzy')).toBeTruthy();
  });

  it('renders the spark accent that dots the "i"', () => {
    render(<Wordmark fontSize={24} />);
    expect(screen.getByText('✦')).toBeTruthy();
  });
});
