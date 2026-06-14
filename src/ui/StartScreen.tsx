/**
 * Start screen (Technical Design §14).
 *
 * Scaffold version: shows the brand and the required anonymous-data notice.
 * Session-choice actions ("1-minute rescue" / "3-minute reset") are wired to
 * the session controller in a later task.
 */
const DATA_NOTICE =
  'This prototype records anonymous interaction events like card attempts, ' +
  'timing, and completion. It is not a cognitive, medical, school, or ' +
  'employment assessment.';

export default function StartScreen() {
  return (
    <main
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 'var(--space-4)',
        padding: 'var(--space-5) var(--space-4)',
      }}
    >
      <header
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-2)',
        }}
      >
        <h1 style={{ margin: 0, fontSize: 'var(--font-size-xl)' }}>LumaLoop</h1>
        <p style={{ margin: 0, color: 'var(--color-text-muted)' }}>
          A short, bounded loop of thinking — not endless scrolling.
        </p>
      </header>

      <p
        style={{
          margin: 0,
          fontSize: 'var(--font-size-sm)',
          color: 'var(--color-text-muted)',
        }}
      >
        {DATA_NOTICE}
      </p>
    </main>
  );
}
