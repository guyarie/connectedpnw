import { beforeEach, describe, expect, it } from 'vitest';
import { runTool, ToolError, type ToolContext } from '../src/tools';
import { FakeGitHub } from './fake-github';

const FAQ = `---
title: "Questions About Connected"
kicker: "FAQ"
# Buttons shown under the questions.
actions:
  - label: "Schedule"
    url: "/contact"
    style: "primary"
faqs:
  - question: "What is Connected?"
    answer: "A program."
  - question: "How much does it cost?"
    answer: "Pricing is shared on the call."
---
`;

const EVENTS = `---
title: "Events"
events_empty_note: "Nothing yet."
events:
  - date: '2026-07-31'
    name: "Fika launch party"
    location: "Seattle"
---
`;

const HOME = `---
title: "Home"
hero_heading: "Hoping to build a lasting relationship?"
hero_lead: "Lead text."
---
`;

const POST = `---
title: "Welcome"
description: "Hi"
date: 2026-07-06
author: "Connected PNW"
draft: true
---

This is a placeholder post.
`;

let gh: FakeGitHub;
let ctx: ToolContext;

beforeEach(() => {
  gh = new FakeGitHub({
    'src/content/site/faq.md': FAQ,
    'src/content/site/events.md': EVENTS,
    'src/content/site/home.md': HOME,
    'src/content/posts/welcome.md': POST,
    'src/pages/index.astro': '<h1/>',
  });
  ctx = { gh, editor: { email: 'miri@connectedpnw.com', name: 'Miri', client: 'Claude' }, siteUrl: 'https://connectedpnw.com' };
});

const run = (name: string, args: unknown = {}) => runTool(name, args, ctx);
const file = (p: string) => gh.files.get(p)!;

describe('pages', () => {
  it('lists pages and reads one with list indexes', async () => {
    const pages = (await run('list_pages')) as { pages: { page: string }[] };
    expect(pages.pages.map((p) => p.page)).toContain('faq');
    const page = (await run('get_page', { page: 'faq' })) as { fields: { faqs: { index: number; question: string }[] } };
    expect(page.fields.faqs[1]).toEqual({ index: 1, question: 'How much does it cost?', answer: 'Pricing is shared on the call.' });
  });

  it('updates a field and records who did it', async () => {
    const r = (await run('update_page', { page: 'home', fields: { hero_heading: 'New heading' }, summary: 'Change hero' })) as { change_id: string };
    expect(r.change_id).toHaveLength(7);
    expect(file('src/content/site/home.md')).toContain('hero_heading: "New heading"');
    expect(file('src/content/site/home.md')).toContain('hero_lead: "Lead text."');
    const c = gh.history.at(-1)!;
    expect(c.message).toBe('Change hero\n\nEdited by Miri via Claude');
    expect(c.author).toBe('Miri');
  });

  it('rejects unknown fields and wrong types before committing', async () => {
    await expect(run('update_page', { page: 'home', fields: { hero_headline: 'x' } })).rejects.toThrow(/hero_headline/);
    await expect(run('update_page', { page: 'home', fields: { enabled: 'yes' } })).rejects.toThrow(/enabled/);
    await expect(run('update_page', { page: 'nope', fields: { title: 'x' } })).rejects.toThrow(ToolError);
    expect(gh.history).toHaveLength(0);
  });

  it('rejects a bad event date with a helpful message', async () => {
    await expect(
      run('add_list_item', { page: 'events', field: 'events', item: { date: 'Oct 3', name: 'Workshop' } }),
    ).rejects.toThrow(/YYYY-MM-DD/);
  });

  it('adds, updates and removes list items, preserving comments', async () => {
    await run('add_list_item', { page: 'faq', field: 'faqs', item: { question: 'Where?', answer: 'Bellevue.' } });
    await run('update_list_item', { page: 'faq', field: 'faqs', where: { question: 'cost' }, changes: { answer: 'See the FAQ.' } });
    await run('remove_list_item', { page: 'faq', field: 'faqs', index: 0 });
    const out = file('src/content/site/faq.md');
    expect(out).toContain('# Buttons shown under the questions.');
    const page = (await run('get_page', { page: 'faq' })) as { fields: { faqs: unknown[] } };
    expect(page.fields.faqs).toEqual([
      { index: 0, question: 'How much does it cost?', answer: 'See the FAQ.' },
      { index: 1, question: 'Where?', answer: 'Bellevue.' },
    ]);
    expect(gh.history).toHaveLength(3);
    expect(gh.history[2].message).toMatch(/^Remove faqs item "What is Connected\?"/);
  });

  it('refuses list operations on the wrong page or with ambiguous matches', async () => {
    await expect(run('add_list_item', { page: 'home', field: 'faqs', item: {} })).rejects.toThrow(/not a list on the home page/);
    await expect(run('update_list_item', { page: 'faq', field: 'faqs', where: { question: 'o' }, changes: {} })).rejects.toThrow(/2 items match/);
    await expect(run('remove_list_item', { page: 'faq', field: 'faqs', index: 9 })).rejects.toThrow(/out of range/);
  });
});

describe('posts', () => {
  it('lists and reads posts', async () => {
    const list = (await run('list_posts')) as { posts: { slug: string; draft: boolean }[] };
    expect(list.posts).toEqual([{ slug: 'welcome', title: 'Welcome', date: '2026-07-06', draft: true, url: 'https://connectedpnw.com/blog/welcome/' }]);
    const post = (await run('get_post', { slug: 'welcome' })) as { body: string };
    expect(post.body).toContain('placeholder post');
    await expect(run('get_post', { slug: 'missing' })).rejects.toThrow(/no post with the slug/);
  });

  it('creates a draft by default, then publishes it', async () => {
    const r = (await run('create_post', { title: 'First Steps: Dating Again', description: 'd', body: '## Hi\n\nText' })) as { slug: string; draft: boolean };
    expect(r).toMatchObject({ slug: 'first-steps-dating-again', draft: true });
    const text = file('src/content/posts/first-steps-dating-again.md');
    expect(text).toMatch(/^---\ntitle: "First Steps: Dating Again"\ndescription: "d"\ndate: "\d{4}-\d{2}-\d{2}"\nauthor: "Connected PNW"\ndraft: true\n---\n## Hi\n\nText\n$/);
    await expect(run('create_post', { title: 'First Steps: Dating Again', description: 'd', body: 'x' })).rejects.toThrow(/already exists/);

    await run('set_post_published', { slug: 'first-steps-dating-again', published: true });
    expect(file('src/content/posts/first-steps-dating-again.md')).toContain('draft: false');
  });

  it('updates fields and body separately', async () => {
    await run('update_post', { slug: 'welcome', title: 'Welcome!', tags: ['intro'] });
    expect(file('src/content/posts/welcome.md')).toContain('title: "Welcome!"');
    expect(file('src/content/posts/welcome.md')).toContain('placeholder post');
    await run('update_post', { slug: 'welcome', body: 'New body' });
    expect(file('src/content/posts/welcome.md')).toMatch(/---\nNew body\n$/);
    await expect(run('update_post', { slug: 'welcome' })).rejects.toThrow(/Nothing to change/);
  });

  it('deletes a post', async () => {
    await run('delete_post', { slug: 'welcome' });
    expect(gh.files.has('src/content/posts/welcome.md')).toBe(false);
  });
});

describe('history and undo', () => {
  it('lists recent content changes only', async () => {
    await gh.commit({ message: 'Refactor header', author: { name: 'Dev', email: 'd@x' }, changes: [{ path: 'src/pages/index.astro', content: '<h2/>' }] });
    await run('update_page', { page: 'home', fields: { hero_lead: 'A' }, summary: 'Tweak lead' });
    const r = (await run('list_recent_changes', {})) as { changes: { summary: string; by: string }[] };
    expect(r.changes).toEqual([{ change_id: expect.any(String), when: expect.any(String), by: 'Miri', summary: 'Tweak lead', url: expect.any(String) }]);
  });

  it('undoes an edit, a creation and a deletion', async () => {
    const edit = (await run('update_page', { page: 'home', fields: { hero_lead: 'Changed' } })) as { change_id: string };
    await run('undo_change', { change_id: edit.change_id });
    expect(file('src/content/site/home.md')).toBe(HOME);
    expect(gh.history.at(-1)!.message).toMatch(/^Undo: Update Home page: hero_lead/);

    const created = (await run('create_post', { title: 'Temp', description: 'd', body: 'b' })) as { change_id: string };
    await run('undo_change', { change_id: created.change_id });
    expect(gh.files.has('src/content/posts/temp.md')).toBe(false);

    const deleted = (await run('delete_post', { slug: 'welcome' })) as { change_id: string };
    await run('undo_change', { change_id: deleted.change_id });
    expect(file('src/content/posts/welcome.md')).toBe(POST);
  });

  it('refuses to undo changes that touch code', async () => {
    const { sha } = await gh.commit({
      message: 'Big change',
      author: { name: 'Dev', email: 'd@x' },
      changes: [{ path: 'src/pages/index.astro', content: 'x' }, { path: 'src/content/site/home.md', content: HOME + '\n' }],
    });
    await expect(run('undo_change', { change_id: sha.slice(0, 7) })).rejects.toThrow(/touched code/);
    await expect(run('undo_change', { change_id: 'zz' })).rejects.toThrow(/change_id/);
  });
});

describe('deploy status', () => {
  it('reports pending, building, live and failed', async () => {
    expect(await run('get_deploy_status')).toMatchObject({ state: 'unknown' });
    const r = (await run('update_page', { page: 'home', fields: { hero_lead: 'A' } })) as { change_id: string };
    const head = gh.head();
    gh.deploy.run = { status: 'completed', conclusion: 'success', head_sha: '0000000', updated_at: 't', url: 'u' };
    expect(await run('get_deploy_status')).toMatchObject({ state: 'pending', latest_change_id: r.change_id });
    gh.deploy.run = { status: 'in_progress', conclusion: null, head_sha: head, updated_at: 't', url: 'u' };
    expect(await run('get_deploy_status')).toMatchObject({ state: 'building' });
    gh.deploy.run = { status: 'completed', conclusion: 'success', head_sha: head, updated_at: 't', url: 'u' };
    expect(await run('get_deploy_status')).toMatchObject({ state: 'live' });
    gh.deploy.run = { status: 'completed', conclusion: 'failure', head_sha: head, updated_at: 't', url: 'u' };
    expect(await run('get_deploy_status')).toMatchObject({ state: 'failed' });
  });
});
