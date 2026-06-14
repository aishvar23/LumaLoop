import { render, screen } from '@testing-library/react';
import Stack from './Stack';

describe('Stack', () => {
  it('renders its children', () => {
    render(
      <Stack>
        <span>one</span>
        <span>two</span>
      </Stack>,
    );
    expect(screen.getByText('one')).toBeInTheDocument();
    expect(screen.getByText('two')).toBeInTheDocument();
  });

  it('lays out as a flex column with a token-based default gap', () => {
    render(<Stack data-testid="stack" />);
    const el = screen.getByTestId('stack');
    expect(el.style.display).toBe('flex');
    expect(el.style.flexDirection).toBe('column');
    expect(el.style.gap).toBe('var(--space-3)');
  });

  it('maps the gap prop to the matching spacing token', () => {
    render(<Stack data-testid="stack" gap={5} />);
    expect(screen.getByTestId('stack').style.gap).toBe('var(--space-5)');
  });

  it('maps align and justify props to flex values', () => {
    render(<Stack data-testid="stack" align="center" justify="between" />);
    const el = screen.getByTestId('stack');
    expect(el.style.alignItems).toBe('center');
    expect(el.style.justifyContent).toBe('space-between');
  });

  it('renders the semantic element from the as prop', () => {
    render(
      <Stack as="section" aria-label="group">
        x
      </Stack>,
    );
    expect(screen.getByRole('region', { name: 'group' }).tagName).toBe(
      'SECTION',
    );
  });

  it('forwards arbitrary props and merges caller style over layout', () => {
    const onClick = vi.fn();
    render(
      <Stack
        data-testid="stack"
        className="custom"
        onClick={onClick}
        style={{ background: 'red', gap: '99px' }}
      />,
    );
    const el = screen.getByTestId('stack');
    expect(el).toHaveClass('custom');
    expect(el.style.background).toBe('red');
    // caller style wins over the primitive's defaults
    expect(el.style.gap).toBe('99px');
    el.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
