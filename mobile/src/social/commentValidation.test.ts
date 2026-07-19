import { validateCommentBody } from './commentValidation';
import { COMMENT_MAX_LENGTH } from './types';

describe('validateCommentBody', () => {
  it('trims and accepts a normal comment', () => {
    const res = validateCommentBody('  hello world  ');
    expect(res.body).toBe('hello world');
    expect(res.error).toBeNull();
  });

  it('rejects an empty string', () => {
    const res = validateCommentBody('');
    expect(res.body).toBeNull();
    expect(res.error).toBeTruthy();
  });

  it('rejects a whitespace-only string', () => {
    const res = validateCommentBody('   \n\t  ');
    expect(res.body).toBeNull();
    expect(res.error).toBeTruthy();
  });

  it('accepts exactly the max length', () => {
    const body = 'a'.repeat(COMMENT_MAX_LENGTH);
    const res = validateCommentBody(body);
    expect(res.body).toBe(body);
    expect(res.error).toBeNull();
  });

  it('rejects over the max length (after trim)', () => {
    const body = 'a'.repeat(COMMENT_MAX_LENGTH + 1);
    const res = validateCommentBody(body);
    expect(res.body).toBeNull();
    expect(res.error).toContain(String(COMMENT_MAX_LENGTH));
  });

  it('counts length AFTER trimming (trailing space does not push over the cap)', () => {
    const body = `${'a'.repeat(COMMENT_MAX_LENGTH)}   `;
    const res = validateCommentBody(body);
    expect(res.body).toBe('a'.repeat(COMMENT_MAX_LENGTH));
    expect(res.error).toBeNull();
  });
});
