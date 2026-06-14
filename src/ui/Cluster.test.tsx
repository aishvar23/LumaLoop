import { render, screen } from '@testing-library/react';
import Cluster from './Cluster';

describe('Cluster', () => {
  it('renders its children', () => {
    render(
      <Cluster>
        <span>a</span>
        <span>b</span>
      </Cluster>,
    );
    expect(screen.getByText('a')).toBeInTheDocument();
    expect(screen.getByText('b')).toBeInTheDocument();
  });

  it('lays out as a wrapping flex row with a token-based default gap', () => {
    render(<Cluster data-testid="cluster" />);
    const el = screen.getByTestId('cluster');
    expect(el.style.display).toBe('flex');
    expect(el.style.flexDirection).toBe('row');
    expect(el.style.flexWrap).toBe('wrap');
    expect(el.style.gap).toBe('var(--space-2)');
  });

  it('disables wrapping when wrap is false', () => {
    render(<Cluster data-testid="cluster" wrap={false} />);
    expect(screen.getByTestId('cluster').style.flexWrap).toBe('nowrap');
  });

  it('maps gap, align and justify props', () => {
    render(
      <Cluster data-testid="cluster" gap={4} align="end" justify="around" />,
    );
    const el = screen.getByTestId('cluster');
    expect(el.style.gap).toBe('var(--space-4)');
    expect(el.style.alignItems).toBe('flex-end');
    expect(el.style.justifyContent).toBe('space-around');
  });

  it('renders the semantic element from the as prop', () => {
    render(
      <Cluster as="nav" aria-label="actions">
        x
      </Cluster>,
    );
    expect(screen.getByRole('navigation', { name: 'actions' }).tagName).toBe(
      'NAV',
    );
  });

  it('forwards props and merges caller style over layout', () => {
    render(
      <Cluster
        data-testid="cluster"
        className="bar"
        style={{ gap: '7px' }}
      />,
    );
    const el = screen.getByTestId('cluster');
    expect(el).toHaveClass('bar');
    expect(el.style.gap).toBe('7px');
  });
});
