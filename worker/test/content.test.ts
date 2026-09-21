import { describe, expect, it } from 'vitest';
import { applyFields, buildFile, parseFrontmatter, serializeFrontmatter, slugify } from '../src/content';

const SAMPLE = `---
title: "Events"
# Shown when there are no upcoming events listed.
events_empty_note: "No events right now."
events:
  - date: '2026-07-31'
    name: "Fika — we'll see you!"
banner_end: '2026-07-31'
---
`;

describe('frontmatter', () => {
  it('round-trips a file, keeping comments and quoting', () => {
    const p = parseFrontmatter(SAMPLE);
    expect(p.data.title).toBe('Events');
    expect(serializeFrontmatter(p.doc, p.body)).toBe(SAMPLE);
  });

  it('applies field changes, removes keys for null, and keeps comments', () => {
    const p = parseFrontmatter(SAMPLE);
    applyFields(p.doc, { events_empty_note: 'Nothing yet.', banner_end: null, enabled: true });
    const out = serializeFrontmatter(p.doc, p.body);
    expect(out).toContain('# Shown when there are no upcoming events listed.');
    expect(out).toContain('events_empty_note: "Nothing yet."');
    expect(out).not.toContain('banner_end');
    expect(out).toContain('enabled: true');
    expect(parseFrontmatter(out).data).toEqual({
      title: 'Events',
      events_empty_note: 'Nothing yet.',
      events: [{ date: '2026-07-31', name: "Fika — we'll see you!" }],
      enabled: true,
    });
  });

  it('does not fold long strings onto multiple lines', () => {
    const p = parseFrontmatter(SAMPLE);
    const long = 'word '.repeat(60).trim();
    applyFields(p.doc, { events_empty_note: long });
    expect(serializeFrontmatter(p.doc, p.body)).toContain(`events_empty_note: "${long}"`);
  });

  it('keeps the markdown body intact', () => {
    const text = `---\ntitle: "Post"\ndraft: true\n---\n\nHello **world**.\n\n## Heading\n`;
    const p = parseFrontmatter(text);
    expect(p.body).toBe('\nHello **world**.\n\n## Heading\n');
    expect(serializeFrontmatter(p.doc, p.body)).toBe(text.replace('---\n\nHello', '---\nHello'));
  });

  it('builds a new file from data', () => {
    const out = buildFile({ title: 'Hi', date: '2026-09-21', tags: ['a'], draft: true }, 'Body');
    expect(out).toBe(`---\ntitle: "Hi"\ndate: "2026-09-21"\ntags:\n  - "a"\ndraft: true\n---\nBody\n`);
  });

  it('rejects files without frontmatter or with broken YAML', () => {
    expect(() => parseFrontmatter('no frontmatter')).toThrow();
    expect(() => parseFrontmatter('---\ntitle: [\n---\n')).toThrow(/Invalid YAML/);
  });

  it('slugifies titles', () => {
    expect(slugify('Why Dating Feels Harder — and what helps!')).toBe('why-dating-feels-harder-and-what-helps');
    expect(slugify('Café Nights')).toBe('cafe-nights');
  });
});
