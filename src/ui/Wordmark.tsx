import './Wordmark.css';

/**
 * The Witzy wordmark — gradient ink, bold, with the dot of the "i" rendered as a
 * bright SPARK (✦): the brand's "clever / aha" mark. The visible letters use a
 * dotless "ı" with the spark floated where the dot would be, so the word reads as
 * "Witzy" with a spark on the i.
 *
 * Accessibility: the decorative letter spans are `aria-hidden` and the wrapper
 * carries the accessible name "Witzy", so assistive tech (and tests) read the
 * brand as "Witzy", never the dotless-i glyph.
 *
 * `className` lets each surface set its own SIZE; the gradient + weight live here
 * so every placement of the wordmark stays visually identical.
 */
export default function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`wordmark ${className}`.trim()} aria-label="Witzy">
      <span aria-hidden="true">W</span>
      <span className="wordmark__i" aria-hidden="true">
        ı<span className="wordmark__spark">✦</span>
      </span>
      <span aria-hidden="true">tzy</span>
    </span>
  );
}
