import { render, screen } from '@testing-library/react';
import Screen from './Screen';

describe('Screen', () => {
  it('renders its children', () => {
    render(
      <Screen>
        <span>body</span>
      </Screen>,
    );
    expect(screen.getByText('body')).toBeInTheDocument();
  });

  it('defaults to the main landmark element', () => {
    render(<Screen>x</Screen>);
    const el = screen.getByRole('main');
    expect(el.tagName).toBe('MAIN');
  });

  it('is a flexible, scrollable column that fills the column height', () => {
    render(<Screen data-testid="screen" />);
    const el = screen.getByTestId('screen');
    expect(el.style.display).toBe('flex');
    expect(el.style.flexDirection).toBe('column');
    expect(el.style.flexGrow).toBe('1');
    expect(el.style.overflowY).toBe('auto');
  });

  it('disables scrolling when scrollable is false', () => {
    render(<Screen data-testid="screen" scrollable={false} />);
    expect(screen.getByTestId('screen').style.overflowY).toBe('visible');
  });

  it('folds the vertical safe-area insets into top/bottom padding', () => {
    render(<Screen data-testid="screen" padding={4} />);
    const el = screen.getByTestId('screen');
    expect(el.style.paddingTop).toBe('calc(var(--space-4) + var(--safe-top))');
    expect(el.style.paddingBottom).toBe(
      'calc(var(--space-4) + var(--safe-bottom))',
    );
    // horizontal padding is the plain token (root owns the horizontal insets)
    expect(el.style.paddingLeft).toBe('var(--space-4)');
    expect(el.style.paddingRight).toBe('var(--space-4)');
  });

  it('renders the semantic element from the as prop', () => {
    render(
      <Screen as="section" aria-label="receipt">
        x
      </Screen>,
    );
    expect(screen.getByRole('region', { name: 'receipt' }).tagName).toBe(
      'SECTION',
    );
  });

  it('forwards props and merges caller style over layout', () => {
    render(
      <Screen data-testid="screen" className="shell" style={{ overflowY: 'scroll' }} />,
    );
    const el = screen.getByTestId('screen');
    expect(el).toHaveClass('shell');
    expect(el.style.overflowY).toBe('scroll');
  });
});
