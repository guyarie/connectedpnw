// Frontmatter handling. Uses the `yaml` Document API so that the comments
// staff have left in the content files survive an edit.
import { parseDocument, type Document } from 'yaml';

const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

export interface ParsedFile {
  doc: Document;
  data: Record<string, unknown>;
  body: string;
}

export function parseFrontmatter(text: string): ParsedFile {
  const m = FM_RE.exec(text);
  if (!m) throw new Error('File has no frontmatter block');
  const doc = parseDocument(m[1]);
  if (doc.errors.length) throw new Error(`Invalid YAML: ${doc.errors[0].message}`);
  const data = (doc.toJS() ?? {}) as Record<string, unknown>;
  return { doc, data, body: m[2] };
}

const YAML_OPTS = { lineWidth: 0, defaultStringType: 'QUOTE_DOUBLE', defaultKeyType: 'PLAIN' } as const;

export function serializeFrontmatter(doc: Document, body: string): string {
  const yamlText = doc.toString(YAML_OPTS).replace(/\n+$/, '');
  const trimmedBody = body.replace(/^\r?\n/, '');
  return `---\n${yamlText}\n---\n${trimmedBody}`;
}

/** Apply top-level field changes to a document. `undefined`/`null` removes the key. */
export function applyFields(doc: Document, fields: Record<string, unknown>) {
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) doc.delete(key);
    else doc.set(key, value);
  }
}

/** Build a brand-new file (used for new blog posts). */
export function buildFile(data: Record<string, unknown>, body: string): string {
  const doc = parseDocument('{}');
  doc.contents = doc.createNode(data) as never;
  return serializeFrontmatter(doc, body.endsWith('\n') ? body : body + '\n');
}

/** Turn a title into a URL slug: "Why Dating Feels Hard!" -> "why-dating-feels-hard" */
export function slugify(title: string): string {
  return title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
