// The editing tools. One definition drives three surfaces: the MCP server
// (Claude, ChatGPT connectors), the REST API + OpenAPI document (ChatGPT
// custom GPT actions) and the tests.
import { z } from 'astro/zod';
import {
  LIST_FIELDS,
  PAGES,
  PAGE_SLUGS,
  postFrontmatterSchema,
  siteSchema,
  type PageSlug,
} from '../../src/content/schema';
import type { GitHubClient, FileChange } from './github';
import { applyFields, buildFile, parseFrontmatter, serializeFrontmatter, slugify, todayISO } from './content';
import type { EditorProps } from './env';

export const CONTENT_DIR = 'src/content';
export const SITE_DIR = `${CONTENT_DIR}/site`;
export const POSTS_DIR = `${CONTENT_DIR}/posts`;

export interface ToolContext {
  gh: GitHubClient;
  editor: EditorProps;
  siteUrl: string;
}

export interface ToolDef<S extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  description: string;
  input: S;
  readOnly: boolean;
  run: (args: z.infer<S>, ctx: ToolContext) => Promise<unknown>;
}

/** Thrown for editor-facing problems (bad input, unknown page). Surfaces as a tool error, not a crash. */
export class ToolError extends Error {}

const pageSlug = z.enum(PAGE_SLUGS as [PageSlug, ...PageSlug[]]).describe('Which page to edit.');
const summary = z
  .string()
  .max(120)
  .optional()
  .describe('One short line describing the change, e.g. "Update FAQ pricing answer". Becomes the change-history entry.');

const listFieldNames = [...new Set(Object.values(LIST_FIELDS).flat())] as string[];

// ---------- helpers ----------

function pagePath(slug: PageSlug) {
  return `${SITE_DIR}/${PAGES[slug].file}`;
}

function postPath(slug: string) {
  if (!/^[a-z0-9-]+$/.test(slug)) throw new ToolError(`"${slug}" is not a valid post slug (lowercase letters, numbers and dashes only).`);
  return `${POSTS_DIR}/${slug}.md`;
}

function formatZodError(err: z.ZodError): string {
  return err.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
}

function validateSite(data: unknown) {
  const r = siteSchema.strict().safeParse(data);
  if (!r.success) throw new ToolError(`That change is not valid: ${formatZodError(r.error)}`);
  return r.data;
}

function validatePost(data: unknown) {
  const r = postFrontmatterSchema.strict().safeParse(data);
  if (!r.success) throw new ToolError(`That post is not valid: ${formatZodError(r.error)}`);
  return r.data;
}

function commitMessage(line: string, ctx: ToolContext) {
  return `${line}\n\nEdited by ${ctx.editor.name} via ${ctx.editor.client}`;
}

async function commitOne(ctx: ToolContext, line: string, changes: FileChange[]) {
  const { sha, url } = await ctx.gh.commit({
    message: commitMessage(line, ctx),
    author: { name: ctx.editor.name, email: ctx.editor.email },
    changes,
  });
  return {
    ok: true,
    change_id: sha.slice(0, 7),
    commit_url: url,
    note: 'Saved. The site rebuilds automatically and the change is usually live within about two minutes. Use get_deploy_status to check, or undo_change with this change_id to roll it back.',
  };
}

async function loadPage(ctx: ToolContext, slug: PageSlug) {
  const { content } = await ctx.gh.readFile(pagePath(slug));
  return parseFrontmatter(content);
}

async function savePage(ctx: ToolContext, slug: PageSlug, parsed: ReturnType<typeof parseFrontmatter>, line: string) {
  validateSite(parsed.doc.toJS());
  const text = serializeFrontmatter(parsed.doc, parsed.body);
  return commitOne(ctx, line, [{ path: pagePath(slug), content: text }]);
}

function getList(parsed: ReturnType<typeof parseFrontmatter>, slug: PageSlug, field: string): Record<string, unknown>[] {
  const allowed = LIST_FIELDS[slug] as readonly string[];
  if (!allowed.includes(field)) {
    throw new ToolError(
      `"${field}" is not a list on the ${slug} page. Lists on this page: ${allowed.length ? allowed.join(', ') : 'none'}.`,
    );
  }
  const current = parsed.doc.get(field);
  const list = (parsed.doc.toJS() as Record<string, unknown>)[field];
  if (current !== undefined && !Array.isArray(list)) throw new ToolError(`"${field}" is not a list in the file.`);
  return (list as Record<string, unknown>[] | undefined) ?? [];
}

function findIndex(list: Record<string, unknown>[], match: { index?: number; where?: Record<string, string> }): number {
  if (match.index !== undefined) {
    if (match.index < 0 || match.index >= list.length) throw new ToolError(`Index ${match.index} is out of range (the list has ${list.length} items, counted from 0).`);
    return match.index;
  }
  if (match.where && Object.keys(match.where).length) {
    const hits = list
      .map((item, i) => ({ item, i }))
      .filter(({ item }) =>
        Object.entries(match.where!).every(([k, v]) => String(item[k] ?? '').toLowerCase().includes(v.toLowerCase())),
      );
    if (hits.length === 1) return hits[0].i;
    if (hits.length === 0) throw new ToolError('No list item matches. Call get_page to see the items and their index.');
    throw new ToolError(`${hits.length} items match; use "index" to pick one. Matching indexes: ${hits.map((h) => h.i).join(', ')}`);
  }
  throw new ToolError('Give either "index" or "where" to identify the item.');
}

const matchShape = {
  index: z.number().int().min(0).optional().describe('Position in the list, counted from 0 (as shown by get_page).'),
  where: z
    .record(z.string())
    .optional()
    .describe('Alternative to index: field values to match, case-insensitive substring, e.g. {"question": "pricing"} or {"name": "Fika"}. Must match exactly one item.'),
};

// ---------- tools ----------

const list_pages: ToolDef = {
  name: 'list_pages',
  description: 'List the editable pages of the website with what each one contains. Start here if unsure where some text lives.',
  input: z.object({}),
  readOnly: true,
  async run(_args, ctx) {
    return {
      site: ctx.siteUrl,
      pages: PAGE_SLUGS.map((slug) => ({
        page: slug,
        label: PAGES[slug].label,
        url: ctx.siteUrl + PAGES[slug].route,
        contains: PAGES[slug].description,
        lists: LIST_FIELDS[slug],
      })),
      blog: 'Blog posts are separate: use list_posts, get_post, create_post, update_post, set_post_published and delete_post.',
    };
  },
};

const get_page: ToolDef = {
  name: 'get_page',
  description:
    'Read all the text of one page as a JSON object of fields. Field names are the keys you pass to update_page. Items inside list fields are shown with their index for use with update_list_item / remove_list_item.',
  input: z.object({ page: pageSlug }),
  readOnly: true,
  async run(args, ctx) {
    const { page } = args as { page: PageSlug };
    const parsed = await loadPage(ctx, page);
    const fields = { ...parsed.data };
    for (const f of LIST_FIELDS[page] as readonly string[]) {
      const list = fields[f];
      if (Array.isArray(list)) fields[f] = list.map((item, index) => ({ index, ...(item as object) }));
    }
    return { page, label: PAGES[page].label, url: ctx.siteUrl + PAGES[page].route, fields };
  },
};

const update_page: ToolDef = {
  name: 'update_page',
  description:
    'Change one or more text fields on a page. Pass only the fields you want to change, with their full new value; other fields are left alone. For fields that are lists (faqs, events, phases, founders, values, features, audiences, actions) prefer add_list_item / update_list_item / remove_list_item. To clear an optional field pass null. The change is validated and goes live within a couple of minutes.',
  input: z.object({
    page: pageSlug,
    fields: z
      .record(z.unknown())
      .describe('Object of field name -> new value, exactly as shown by get_page. Keep the meaning of a field: e.g. hero_heading is the big heading on the home page.'),
    summary,
  }),
  readOnly: false,
  async run(args, ctx) {
    const { page, fields, summary } = args as { page: PageSlug; fields: Record<string, unknown>; summary?: string };
    if (!Object.keys(fields).length) throw new ToolError('No fields given.');
    const parsed = await loadPage(ctx, page);
    applyFields(parsed.doc, fields);
    return savePage(ctx, page, parsed, summary || `Update ${PAGES[page].label}: ${Object.keys(fields).join(', ')}`);
  },
};

const add_list_item: ToolDef = {
  name: 'add_list_item',
  description:
    'Add one item to a list field on a page: a new FAQ (faqs), event (events), value (values), etc. Look at get_page first to copy the shape of the existing items. New items go at the end unless "position" is given.',
  input: z.object({
    page: pageSlug,
    field: z.enum(listFieldNames as [string, ...string[]]).describe('Which list, e.g. "faqs" or "events".'),
    item: z.record(z.unknown()).describe('The new item, with the same keys as the existing items.'),
    position: z.number().int().min(0).optional().describe('Insert at this index (0 = first). Default: append.'),
    summary,
  }),
  readOnly: false,
  async run(args, ctx) {
    const { page, field, item, position, summary } = args as {
      page: PageSlug; field: string; item: Record<string, unknown>; position?: number; summary?: string;
    };
    const parsed = await loadPage(ctx, page);
    const list = [...getList(parsed, page, field)];
    const at = position === undefined ? list.length : Math.min(position, list.length);
    list.splice(at, 0, item);
    applyFields(parsed.doc, { [field]: list });
    return savePage(ctx, page, parsed, summary || `Add ${field} item on ${PAGES[page].label}`);
  },
};

const update_list_item: ToolDef = {
  name: 'update_list_item',
  description:
    'Change one item in a list field on a page (for example one FAQ answer or one event\'s time). Identify the item by index or by matching fields; pass only the keys to change.',
  input: z.object({
    page: pageSlug,
    field: z.enum(listFieldNames as [string, ...string[]]),
    ...matchShape,
    changes: z.record(z.unknown()).describe('Keys to change on that item, with their full new value. Pass null to remove an optional key.'),
    summary,
  }),
  readOnly: false,
  async run(args, ctx) {
    const { page, field, index, where, changes, summary } = args as {
      page: PageSlug; field: string; index?: number; where?: Record<string, string>; changes: Record<string, unknown>; summary?: string;
    };
    const parsed = await loadPage(ctx, page);
    const list = [...getList(parsed, page, field)];
    const i = findIndex(list, { index, where });
    const updated = { ...list[i] };
    for (const [k, v] of Object.entries(changes)) {
      if (v === null || v === undefined) delete updated[k];
      else updated[k] = v;
    }
    list[i] = updated;
    applyFields(parsed.doc, { [field]: list });
    return savePage(ctx, page, parsed, summary || `Update ${field} item ${i} on ${PAGES[page].label}`);
  },
};

const remove_list_item: ToolDef = {
  name: 'remove_list_item',
  description: 'Remove one item from a list field on a page (for example a past event or an FAQ). Identify it by index or by matching fields.',
  input: z.object({ page: pageSlug, field: z.enum(listFieldNames as [string, ...string[]]), ...matchShape, summary }),
  readOnly: false,
  async run(args, ctx) {
    const { page, field, index, where, summary } = args as {
      page: PageSlug; field: string; index?: number; where?: Record<string, string>; summary?: string;
    };
    const parsed = await loadPage(ctx, page);
    const list = [...getList(parsed, page, field)];
    const i = findIndex(list, { index, where });
    const [removed] = list.splice(i, 1);
    applyFields(parsed.doc, { [field]: list });
    const label = String(removed.name ?? removed.question ?? removed.heading ?? removed.label ?? i);
    return savePage(ctx, page, parsed, summary || `Remove ${field} item "${label}" from ${PAGES[page].label}`);
  },
};

// ----- blog posts -----

async function loadPost(ctx: ToolContext, slug: string) {
  try {
    const { content } = await ctx.gh.readFile(postPath(slug));
    return parseFrontmatter(content);
  } catch (e) {
    if ((e as { status?: number }).status === 404) throw new ToolError(`There is no post with the slug "${slug}". Use list_posts to see them.`);
    throw e;
  }
}

const list_posts: ToolDef = {
  name: 'list_posts',
  description: 'List all blog posts (published and drafts) with their slug, title, date and draft status.',
  input: z.object({}),
  readOnly: true,
  async run(_args, ctx) {
    const entries = await ctx.gh.listDir(POSTS_DIR);
    const posts = await Promise.all(
      entries
        .filter((e) => e.type === 'file' && e.name.endsWith('.md'))
        .map(async (e) => {
          const { content } = await ctx.gh.readFile(e.path);
          const { data } = parseFrontmatter(content);
          const slug = e.name.replace(/\.md$/, '');
          return {
            slug,
            title: data.title,
            date: String(data.date ?? ''),
            draft: data.draft === true,
            url: `${ctx.siteUrl}/blog/${slug}/`,
          };
        }),
    );
    posts.sort((a, b) => (a.date < b.date ? 1 : -1));
    return { posts };
  },
};

const get_post: ToolDef = {
  name: 'get_post',
  description: 'Read one blog post: its frontmatter fields (title, description, date, author, tags, draft) and the Markdown body.',
  input: z.object({ slug: z.string().describe('The post slug from list_posts.') }),
  readOnly: true,
  async run(args, ctx) {
    const { slug } = args as { slug: string };
    const parsed = await loadPost(ctx, slug);
    return { slug, fields: parsed.data, body: parsed.body, url: `${ctx.siteUrl}/blog/${slug}/` };
  },
};

const postFields = {
  title: z.string().describe('Post title.'),
  description: z.string().describe('One or two sentences shown in the listing and used for search engines.'),
  body: z.string().describe('The article in Markdown. Headings with ##, paragraphs separated by blank lines.'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('YYYY-MM-DD. Default: today.'),
  author: z.string().optional().describe('Default: "Connected PNW".'),
  tags: z.array(z.string()).optional(),
};

const create_post: ToolDef = {
  name: 'create_post',
  description:
    'Create a new blog post. It is saved as a DRAFT (not visible on the site) unless published is true. Publish later with set_post_published. Returns the slug.',
  input: z.object({
    ...postFields,
    slug: z.string().optional().describe('URL slug. Default: made from the title.'),
    published: z.boolean().optional().describe('Set true to make it live immediately. Default false (draft).'),
    summary,
  }),
  readOnly: false,
  async run(args, ctx) {
    const a = args as z.infer<z.ZodObject<typeof postFields>> & { slug?: string; published?: boolean; summary?: string };
    const slug = a.slug ? slugify(a.slug) : slugify(a.title);
    if (!slug) throw new ToolError('Could not make a slug from that title; pass "slug" explicitly.');
    const path = postPath(slug);
    let exists = true;
    try {
      await ctx.gh.readFile(path);
    } catch (e) {
      if ((e as { status?: number }).status === 404) exists = false;
      else throw e;
    }
    if (exists) throw new ToolError(`A post with the slug "${slug}" already exists. Use update_post, or pass a different slug.`);
    const data = validatePost({
      title: a.title,
      description: a.description,
      date: a.date ?? todayISO(),
      author: a.author ?? 'Connected PNW',
      ...(a.tags?.length ? { tags: a.tags } : {}),
      draft: !a.published,
    });
    const text = buildFile(data, a.body);
    const result = await commitOne(ctx, a.summary || `Add blog post: ${a.title}`, [{ path, content: text }]);
    return { ...result, slug, draft: data.draft, url: `${ctx.siteUrl}/blog/${slug}/` };
  },
};

const update_post: ToolDef = {
  name: 'update_post',
  description: 'Change an existing blog post. Pass only what changes; "body" replaces the whole Markdown body.',
  input: z.object({
    slug: z.string(),
    title: z.string().optional(),
    description: z.string().optional(),
    body: z.string().optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    author: z.string().optional(),
    tags: z.array(z.string()).nullable().optional(),
    image: z.string().nullable().optional().describe('Path of an image already in the site, e.g. /images/photo.jpg.'),
    summary,
  }),
  readOnly: false,
  async run(args, ctx) {
    const { slug, body, summary: sum, ...fields } = args as Record<string, unknown> & { slug: string; body?: string; summary?: string };
    const parsed = await loadPost(ctx, slug);
    const fm = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
    if (!Object.keys(fm).length && body === undefined) throw new ToolError('Nothing to change.');
    applyFields(parsed.doc, fm);
    validatePost(parsed.doc.toJS());
    const text = serializeFrontmatter(parsed.doc, body !== undefined ? (body.endsWith('\n') ? body : body + '\n') : parsed.body);
    return commitOne(ctx, sum || `Update blog post: ${parsed.data.title}`, [{ path: postPath(slug), content: text }]);
  },
};

const set_post_published: ToolDef = {
  name: 'set_post_published',
  description: 'Publish a draft post (published: true) or take a post off the site without deleting it (published: false).',
  input: z.object({ slug: z.string(), published: z.boolean(), summary }),
  readOnly: false,
  async run(args, ctx) {
    const { slug, published, summary: sum } = args as { slug: string; published: boolean; summary?: string };
    const parsed = await loadPost(ctx, slug);
    applyFields(parsed.doc, { draft: !published });
    validatePost(parsed.doc.toJS());
    const text = serializeFrontmatter(parsed.doc, parsed.body);
    return commitOne(ctx, sum || `${published ? 'Publish' : 'Unpublish'} blog post: ${parsed.data.title}`, [
      { path: postPath(slug), content: text },
    ]);
  },
};

const delete_post: ToolDef = {
  name: 'delete_post',
  description: 'Delete a blog post permanently. Prefer set_post_published with published: false unless the post should really go. Can be undone with undo_change.',
  input: z.object({ slug: z.string(), summary }),
  readOnly: false,
  async run(args, ctx) {
    const { slug, summary: sum } = args as { slug: string; summary?: string };
    const parsed = await loadPost(ctx, slug);
    return commitOne(ctx, sum || `Remove blog post: ${parsed.data.title}`, [{ path: postPath(slug), content: null }]);
  },
};

// ----- history / undo / status -----

const list_recent_changes: ToolDef = {
  name: 'list_recent_changes',
  description: 'Show the most recent content changes (by anyone, through any tool), newest first, with a change_id that undo_change accepts.',
  input: z.object({ limit: z.number().int().min(1).max(30).optional().describe('Default 10.') }),
  readOnly: true,
  async run(args, ctx) {
    const { limit = 10 } = args as { limit?: number };
    const commits = await ctx.gh.listCommits(CONTENT_DIR, limit);
    return {
      changes: commits.map((c) => ({
        change_id: c.short,
        when: c.date,
        by: c.author,
        summary: c.message.split('\n')[0],
        url: c.url,
      })),
    };
  },
};

const undo_change: ToolDef = {
  name: 'undo_change',
  description:
    'Roll back one content change: restores the files that change touched to how they were just before it. Only content changes can be undone (not code). The undo is itself a new change, so it can be undone too.',
  input: z.object({ change_id: z.string().describe('From list_recent_changes or from the result of an edit.'), summary }),
  readOnly: false,
  async run(args, ctx) {
    const { change_id, summary: sum } = args as { change_id: string; summary?: string };
    if (!/^[0-9a-f]{7,40}$/i.test(change_id)) throw new ToolError('That does not look like a change_id.');
    const c = await ctx.gh.getCommit(change_id);
    if (c.parents.length !== 1) throw new ToolError('That change is a merge and cannot be undone automatically; ask the developer.');
    if (!c.files.length) throw new ToolError('That change touched no files.');
    const outside = c.files.filter((f) => !f.path.startsWith(`${CONTENT_DIR}/`) && !(f.previous_path ?? '').startsWith(`${CONTENT_DIR}/`));
    if (outside.length) {
      throw new ToolError(`That change also touched code (${outside.map((f) => f.path).join(', ')}), so it must be undone by the developer.`);
    }
    const parent = c.parents[0];
    const changes: FileChange[] = [];
    for (const f of c.files) {
      switch (f.status) {
        case 'added':
          changes.push({ path: f.path, content: null });
          break;
        case 'removed':
        case 'modified':
        case 'changed':
          changes.push({ path: f.path, content: (await ctx.gh.readFile(f.path, parent)).content });
          break;
        case 'renamed':
          changes.push({ path: f.path, content: null });
          changes.push({ path: f.previous_path!, content: (await ctx.gh.readFile(f.previous_path!, parent)).content });
          break;
        default:
          throw new ToolError(`Cannot undo a "${f.status}" change to ${f.path}; ask the developer.`);
      }
    }
    const title = c.message.split('\n')[0];
    const result = await commitOne(ctx, sum || `Undo: ${title}`, changes);
    return { ...result, undid: { change_id: c.short, summary: title, by: c.author } };
  },
};

const get_deploy_status: ToolDef = {
  name: 'get_deploy_status',
  description: 'Check whether the latest change has been published to the live site yet.',
  input: z.object({}),
  readOnly: true,
  async run(_args, ctx) {
    const { run, headSha } = await ctx.gh.latestDeploy();
    if (!run) return { state: 'unknown', note: 'No deploy has run yet.' };
    const forLatest = run.head_sha === headSha;
    let state: string;
    let note: string;
    if (!forLatest) {
      state = 'pending';
      note = 'The latest change has not started building yet. Check again in a minute.';
    } else if (run.status !== 'completed') {
      state = 'building';
      note = 'The site is being rebuilt with the latest change. Usually done within two minutes.';
    } else if (run.conclusion === 'success') {
      state = 'live';
      note = 'The latest change is live on the site.';
    } else {
      state = 'failed';
      note = `The build ${run.conclusion}. The previous version of the site is still up. Undo the latest change or ask the developer.`;
    }
    return { state, note, latest_change_id: headSha.slice(0, 7), last_build: run.updated_at, details: run.url };
  },
};

export const TOOLS: ToolDef[] = [
  list_pages,
  get_page,
  update_page,
  add_list_item,
  update_list_item,
  remove_list_item,
  list_posts,
  get_post,
  create_post,
  update_post,
  set_post_published,
  delete_post,
  list_recent_changes,
  undo_change,
  get_deploy_status,
];

export const TOOL_MAP = new Map(TOOLS.map((t) => [t.name, t]));

export const SERVER_INSTRUCTIONS = `You are helping the Connected PNW team edit their website (a small static site).
Every write tool saves straight to the live site; changes appear within about two minutes. Everything can be rolled back with undo_change.

Workflow:
1. If unsure where some text lives, call list_pages, then get_page to read the current wording.
2. Change text with update_page (plain fields) or add_list_item / update_list_item / remove_list_item (FAQs, events, values, etc.).
3. Blog posts: create_post saves a draft; set_post_published makes it live.
4. Confirm with get_deploy_status if the person asks whether it is live.

Keep the site's voice: warm, plain, no hype. Do not change form endpoints or URLs in the contact page unless asked explicitly. When the person's request is ambiguous about which text they mean, show them the current text and ask before saving.`;

/** Run a tool with validated input. Returns a plain result object; throws ToolError for user-facing problems. */
export async function runTool(name: string, rawArgs: unknown, ctx: ToolContext): Promise<unknown> {
  const tool = TOOL_MAP.get(name);
  if (!tool) throw new ToolError(`Unknown tool "${name}".`);
  const parsed = tool.input.safeParse(rawArgs ?? {});
  if (!parsed.success) throw new ToolError(`Invalid input: ${formatZodError(parsed.error)}`);
  return tool.run(parsed.data, ctx);
}
