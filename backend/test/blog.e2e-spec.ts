import { hash } from '@node-rs/argon2';
import { BLOG_BODY_MIN_CHARS } from '@edu-forum/shared';
import { EICAR } from '../src/infra/scanner/virus-scanner';
import { SeoNotifier } from '../src/modules/seo/seo-notifier';
import { publishedTeacher } from './fixtures';
import { createTestApp, deleteTestUsers, PNG, uploadFile, uniqueEmail, verifiedUser, type SignedInUser, type TestApp } from './utils';

const BODY = `<p>${'Revision that works: past questions, timed practice and marking schemes. '.repeat(6)}</p>`;

describe('Blog (e2e)', () => {
  let t: TestApp;
  let admin: SignedInUser;

  beforeAll(async () => {
    t = await createTestApp();
    const email = uniqueEmail('admin');
    const u = await t.prisma.user.create({ data: { email, role: 'admin', passwordHash: await hash('admin2026x'), emailVerifiedAt: new Date() } });
    const res = await t.http.post('/api/v1/auth/login').send({ identifier: email, password: 'admin2026x' }).expect(200);
    admin = { email, userId: u.id, auth: `Bearer ${res.body.accessToken}` };
  });

  afterAll(async () => {
    await deleteTestUsers(t.prisma);
    await t.close();
  });

  const create = (u: SignedInUser, body: Record<string, unknown>, status = 201) => t.http.post('/api/v1/posts').set('Authorization', u.auth).send(body).expect(status);
  const submit = (u: SignedInUser, id: string, status = 200) => t.http.post(`/api/v1/posts/${id}/submit`).set('Authorization', u.auth).expect(status);
  const approve = (id: string, status = 200) => t.http.post(`/api/v1/admin/posts/${id}/approve`).set('Authorization', admin.auth).expect(status);
  /** A published post by `u` (created, sent, approved). */
  async function published(u: SignedInUser, title = `WAEC physics revision plan ${Date.now()}`) {
    const draft = (await create(u, { title, body: BODY, category: 'exam-prep' })).body;
    await submit(u, draft.id);
    const res = (await approve(draft.id)).body;
    return { id: draft.id as string, path: res.path as string, slug: String(res.path).replace('/blog/', '') };
  }

  it('anyone registered writes; sending needs a category and enough text; an admin approves; then it is public with a fixed slug', async () => {
    const teacher = await publishedTeacher(t, 'Bisi Writer');
    const tags = await t.http.get('/api/v1/blog/categories').expect(200);
    expect(tags.body.map((c: { slug: string }) => c.slug)).toEqual(['career-tips', 'exam-prep', 'school-news']);

    const draft = (await create(teacher, { title: 'How I prepare SS3 students for WAEC physics', body: '<p>Short</p><script>alert(1)</script>' })).body;
    expect(draft).toMatchObject({ status: 'draft', path: null, body: '<p>Short</p>' });
    const missing = await submit(teacher, draft.id, 422);
    expect(missing.body.error.details.missing).toEqual(['category', 'body']);

    await t.http.patch(`/api/v1/posts/${draft.id}`).set('Authorization', teacher.auth).send({ body: BODY, category: 'exam-prep', excerpt: 'My WAEC plan' }).expect(200);
    expect((await submit(teacher, draft.id)).body.status).toBe('pending');
    // Not public while waiting.
    const list = await t.http.get('/api/v1/posts?limit=50').expect(200);
    expect(list.body.data.some((p: { id: string }) => p.id === draft.id)).toBe(false);

    const seo = t.app.get(SeoNotifier);
    const before = seo.revalidated.length;
    const ok = (await approve(draft.id)).body;
    expect(ok.path).toBe('/blog/how-i-prepare-ss3-students-for-waec-physics');
    expect(seo.revalidated.slice(before)).toContainEqual(['blog', 'blog:how-i-prepare-ss3-students-for-waec-physics']);
    const page = await t.http.get('/api/v1/posts/by-slug/how-i-prepare-ss3-students-for-waec-physics').expect(200);
    expect(page.body).toMatchObject({ title: 'How I prepare SS3 students for WAEC physics', excerpt: 'My WAEC plan', category: { slug: 'exam-prep', name: 'Exam prep' }, author: { name: 'Bisi Writer', role: 'teacher' }, likes: 0, likedByMe: false });
    const note = await t.prisma.notification.findFirst({ where: { userId: teacher.userId, type: 'blog_review' } });
    expect(note).not.toBeNull();
    const sitemap = await t.http.get('/api/v1/seo/sitemap/blog').expect(200);
    expect(sitemap.body.data.map((e: { path: string }) => e.path)).toContain(ok.path);
    const meta = await t.http.get(`/api/v1/seo/meta?path=${ok.path}`).expect(200);
    expect(meta.body).toMatchObject({ kind: 'blog_post', indexable: true, h1: 'How I prepare SS3 students for WAEC physics' });

    // Editing a published post sends it back for approval (offline); the slug stays.
    await t.http.patch(`/api/v1/posts/${draft.id}`).set('Authorization', teacher.auth).send({ title: 'A new title for my WAEC plan' }).expect(200);
    await t.http.get(`/api/v1/posts/by-slug/${ok.path.slice(6)}`).expect(404);
    expect((await approve(draft.id)).body.path).toBe(ok.path);

    // Principals and directors write too, shown by role; teachers cannot use the admin queue.
    const director = await verifiedUser(t, 'director');
    const d = await published(director, 'Running a school library on a small budget');
    expect((await t.http.get(`/api/v1/posts/by-slug/${d.slug}`).expect(200)).body.author).toEqual({ name: 'Director', role: 'director' });
    await t.http.get('/api/v1/admin/posts').set('Authorization', teacher.auth).expect(403);
    // Someone else's post is not yours to edit or delete.
    await t.http.patch(`/api/v1/posts/${d.id}`).set('Authorization', teacher.auth).send({ title: 'Hijacked title here' }).expect(404);
    await t.http.delete(`/api/v1/posts/${d.id}`).set('Authorization', teacher.auth).expect(404);
  });

  it('rejection carries a reason; the writer edits and sends again; admins publish their own posts directly', async () => {
    const teacher = await verifiedUser(t);
    const draft = (await create(teacher, { title: 'Ten tips for new teachers', body: BODY, category: 'career-tips' })).body;
    await submit(teacher, draft.id);
    await t.http.post(`/api/v1/admin/posts/${draft.id}/reject`).set('Authorization', admin.auth).send({ reason: 'Please add sources' }).expect(200);
    const mine = await t.http.get(`/api/v1/posts/mine/${draft.id}`).set('Authorization', teacher.auth).expect(200);
    expect(mine.body).toMatchObject({ status: 'rejected', reviewNote: 'Please add sources' });
    await approve(draft.id, 422);
    expect((await submit(teacher, draft.id)).body).toMatchObject({ status: 'pending', reviewNote: null });
    const queue = await t.http.get('/api/v1/admin/posts?status=pending&limit=50').set('Authorization', admin.auth).expect(200);
    expect(queue.body.data.find((p: { id: string }) => p.id === draft.id).author.email).toBe(teacher.email);

    const own = (await create(admin, { title: 'Welcome to the EDU-FORUM blog', body: BODY, category: 'school-news' })).body;
    const live = (await submit(admin, own.id)).body;
    expect(live).toMatchObject({ status: 'published', path: '/blog/welcome-to-the-edu-forum-blog' });
    const audit = await t.prisma.auditLog.findFirst({ where: { action: 'blog.reject', targetId: draft.id } });
    expect(audit).not.toBeNull();
  });

  it('validation: phone numbers, title length, unknown category', async () => {
    const teacher = await verifiedUser(t);
    const phone = await create(teacher, { title: 'Call me for lessons please', body: '<p>Ring <strong>0803 123 4567</strong> today</p>' }, 400);
    expect(phone.body.error.details.issues[0].path).toBe('body');
    await create(teacher, { title: 'Short' }, 400);
    await create(teacher, { title: 'A good long title here', category: 'cooking' }, 400);
    expect(BLOG_BODY_MIN_CHARS).toBe(300);
  });

  it('everyone reads comments and likes; only registered users like and comment; the writer is told; blocks hide comments both ways', async () => {
    const writer = await publishedTeacher(t, 'Writer Wale');
    const reader = await verifiedUser(t, 'principal');
    const blocked = await verifiedUser(t);
    const p = await published(writer);

    await t.http.post(`/api/v1/posts/${p.id}/like`).expect(401);
    await t.http.post(`/api/v1/posts/${p.id}/comments`).send({ body: 'Hi' }).expect(401);
    for (let i = 0; i < 2; i++) await t.http.post(`/api/v1/posts/${p.id}/like`).set('Authorization', reader.auth).expect(200);
    const c = await t.http.post(`/api/v1/posts/${p.id}/comments`).set('Authorization', reader.auth).send({ body: 'Very useful, thank you' }).expect(201);
    await t.http.post(`/api/v1/posts/${p.id}/comments`).set('Authorization', blocked.auth).send({ body: 'I disagree' }).expect(201);
    await t.http.post(`/api/v1/posts/${p.id}/comments`).set('Authorization', reader.auth).send({ body: 'WhatsApp me on 08031234567' }).expect(400);

    // Signed-out readers (and Google) see comments and counts.
    const pub = await t.http.get(`/api/v1/posts/${p.id}/comments`).expect(200);
    expect(pub.body.data.map((x: { body: string }) => x.body)).toEqual(['Very useful, thank you', 'I disagree']);
    expect(pub.body.data[0]).toMatchObject({ author: { name: 'Principal', role: 'principal' }, mine: false, likedByMe: false });
    const page = await t.http.get(`/api/v1/posts/by-slug/${p.slug}`).set('Authorization', reader.auth).expect(200);
    expect(page.body).toMatchObject({ likes: 1, comments: 2, likedByMe: true });
    expect(await t.prisma.notification.count({ where: { userId: writer.userId, type: 'blog_comment' } })).toBe(2);

    await t.http.post('/api/v1/community/blocks').set('Authorization', reader.auth).send({ userId: blocked.userId }).expect(204);
    const forReader = await t.http.get(`/api/v1/posts/${p.id}/comments`).set('Authorization', reader.auth).expect(200);
    expect(forReader.body.data.map((x: { body: string }) => x.body)).toEqual(['Very useful, thank you']);
    const forBlocked = await t.http.get(`/api/v1/posts/${p.id}/comments`).set('Authorization', blocked.auth).expect(200);
    expect(forBlocked.body.data.map((x: { body: string }) => x.body)).toEqual(['I disagree']);

    // Comment likes; deleting your own comment lowers the count.
    await t.http.post(`/api/v1/blog-comments/${c.body.id}/like`).set('Authorization', writer.auth).expect(200);
    await t.http.delete(`/api/v1/blog-comments/${c.body.id}`).set('Authorization', writer.auth).expect(404);
    await t.http.delete(`/api/v1/blog-comments/${c.body.id}`).set('Authorization', reader.auth).expect(204);
    expect((await t.http.get(`/api/v1/posts/by-slug/${p.slug}`).expect(200)).body.comments).toBe(1);
  });

  it('report → admin removes the post or a comment; the writer is told why; audit-logged', async () => {
    const writer = await verifiedUser(t);
    const reader = await verifiedUser(t);
    const p = await published(writer);
    const c = await t.http.post(`/api/v1/posts/${p.id}/comments`).set('Authorization', reader.auth).send({ body: 'Rude words' }).expect(201);
    await t.http.post('/api/v1/reports').set('Authorization', reader.auth).send({ targetType: 'blog_post', targetId: p.id, reason: 'spam' }).expect(201);
    await t.http.post('/api/v1/reports').set('Authorization', writer.auth).send({ targetType: 'blog_comment', targetId: c.body.id, reason: 'inappropriate' }).expect(201);

    await t.http.post(`/api/v1/admin/blog-comments/${c.body.id}/remove`).set('Authorization', admin.auth).send({ reason: 'Abusive language' }).expect(200);
    expect((await t.http.get(`/api/v1/posts/${p.id}/comments`).expect(200)).body.data).toEqual([]);
    await t.http.post(`/api/v1/admin/posts/${p.id}/remove`).set('Authorization', admin.auth).send({ reason: 'Copied from another site' }).expect(200);
    await t.http.get(`/api/v1/posts/by-slug/${p.slug}`).expect(404);
    const mine = await t.http.get(`/api/v1/posts/mine/${p.id}`).set('Authorization', writer.auth).expect(200);
    expect(mine.body).toMatchObject({ removedReason: 'Copied from another site', path: null });
    await submit(writer, p.id, 422);
    expect(await t.prisma.notification.count({ where: { userId: writer.userId, type: 'moderation' } })).toBe(1);
    expect(await t.prisma.auditLog.count({ where: { action: { in: ['blog.remove', 'blog.comment.remove'] }, targetId: { in: [p.id, c.body.id] } } })).toBe(2);
  });

  it('cover photos are scanned: clean ones are served through a fresh link, infected ones are dropped', async () => {
    const writer = await verifiedUser(t);
    const good = await uploadFile(t, writer.auth, 'post_cover', 'cover.png', 'image/png', PNG);
    const draft = (await create(writer, { title: 'Our new science lab opened', body: BODY, category: 'school-news', coverUploadId: good })).body;
    expect((await t.http.get(`/api/v1/posts/mine/${draft.id}`).set('Authorization', writer.auth).expect(200)).body.coverStatus).toBe('ready');
    await submit(writer, draft.id);
    const { path } = (await approve(draft.id)).body;
    expect((await t.http.get(`/api/v1/posts/by-slug/${path.slice(6)}`).expect(200)).body.hasCover).toBe(true);
    const cover = await t.http.get(`/api/v1/posts/${draft.id}/cover`).expect(302);
    expect(cover.headers.location).toMatch(/^memory:\/\/get\//);

    const bad = await uploadFile(t, writer.auth, 'post_cover', 'bad.png', 'image/png', Buffer.concat([PNG, Buffer.from(EICAR)]));
    const other = (await create(writer, { title: 'Another post with a cover', coverUploadId: bad })).body;
    expect((await t.http.get(`/api/v1/posts/mine/${other.id}`).set('Authorization', writer.auth).expect(200)).body).toMatchObject({ coverStatus: 'none', coverUploadId: null });
  });

  it('published posts can be shared into the community feed; drafts cannot', async () => {
    const writer = await publishedTeacher(t);
    const p = await published(writer);
    const draft = (await create(writer, { title: 'Still a draft post here' })).body;
    const share = await t.http.post('/api/v1/community/posts').set('Authorization', writer.auth).send({ body: 'New on the blog', blogPostId: p.id }).expect(201);
    expect(share.body.blog).toMatchObject({ id: p.id, path: p.path, hasCover: false });
    await t.http.post('/api/v1/community/posts').set('Authorization', writer.auth).send({ blogPostId: draft.id }).expect(422);
  });

  it('erasing an account removes its posts, comments and likes', async () => {
    const leaving = await publishedTeacher(t, 'Leaving Lara');
    const other = await verifiedUser(t);
    const mine = await published(leaving);
    const theirs = await published(other);
    await t.http.post(`/api/v1/posts/${theirs.id}/like`).set('Authorization', leaving.auth).expect(200);
    await t.http.post(`/api/v1/posts/${theirs.id}/comments`).set('Authorization', leaving.auth).send({ body: 'Bye all' }).expect(201);
    const { AccountDeletionService } = await import('../src/modules/users/account-deletion.service');
    await t.app.get(AccountDeletionService).erase(leaving.userId);
    await t.prisma.user.update({ where: { id: leaving.userId }, data: { email: leaving.email } });

    await t.http.get(`/api/v1/posts/by-slug/${mine.slug}`).expect(404);
    expect((await t.http.get(`/api/v1/posts/by-slug/${theirs.slug}`).expect(200)).body).toMatchObject({ likes: 0, comments: 0 });
  });
});
