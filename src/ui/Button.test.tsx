import { render, screen } from '@testing-library/react';
import Button from './Button';

describe('Button', () => {
  it('renders with type="button" by default to avoid implicit form submit', () => {
    render(<Button>Tap</Button>);
    expect(screen.getByRole('button', { name: 'Tap' })).toHaveAttribute(
      'type',
      'button',
    );
  });

  it('allows callers to override the html button type', () => {
    render(<Button type="submit">Send</Button>);
    expect(screen.getByRole('button', { name: 'Send' })).toHaveAttribute(
      'type',
      'submit',
    );
  });
});
