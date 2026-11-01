import { hash } from '@node-rs/argon2';
import type { AddressInfo } from 'node:net';
import { io, type Socket } from 'socket.io-client';
import { COMMUNITY_POST_MAX_CHARS, COMMUNITY_WS_EVENTS } from '@edu-forum/shared';
import { EICAR } from '../src/infra/scanner/virus-scanner';
import { liveVacancy, publishedTeacher } from './fixtures';
import { createTestApp, deleteTestUsers, PNG, uploadFile, verifiedUser, type SignedInUser, type TestApp, uniqueEmail } from './utils';

describe('Community feed (e2e)', () => {
  let t: TestApp;
  let admin: { auth: string };

  beforeAll(async () => {
    t = await createTestApp();
    await t.app.listen(0);
    const email = uniqueEmail('admin');
    await t.prisma.user.create({ data: { email, role: 'admin', passwordHash: await hash('admin2026x'), emailVerifiedAt: new Date() } });
    const res = await t.http.post('/api/v1/auth/login').send({ identifier: email, password: 'admin2026x' }).expect(200);
    admin = { auth: `Bearer ${res.body.accessToken}` };
  });

  afterAll(async () => {
    await deleteTestUsers(t.prisma);
    await t.close();
  });

  const post = (u: SignedInUser, body: Record<string, unknown>, status = 201) => t.http.post('/api/v1/community/posts').set('Authorization', u.auth).send(body).expect(status);
  const feed = async (u: SignedInUser, query = '') => (await t.http.get(`/api/v1/community/posts${query}`).set('Authorization', u.auth).expect(200)).body;

  it('everyone signed in sees every post, newest first; teachers by name, leaders by role; tags filter', async () => {
    const teacher = await publishedTeacher(t, 'Amaka Feed');
    const principal = await verifiedUser(t, 'principal');
    const tags = await t.http.get('/api/v1/community/tags').set('Authorization', teacher.auth).expect(200);
    expect(tags.body.map((x: { slug: string }) => x.slug)).toEqual(['general', 'lesson-ideas', 'exam-prep', 'classroom-management', 'job-tips', 'salary-talk']);

    const first = await post(teacher, { body: 'My best WAEC physics revision trick', tag: 'exam-prep' });
    expect(first.body).toMatchObject({ author: { name: 'Amaka Feed', role: 'teacher', teacherId: null }, tag: { slug: 'exam-prep', name: 'Exam prep (WAEC/NECO)' }, likes: 0, mine: true });
    const second = await post(principal, { body: 'We are hiring physics teachers next term', tag: 'job-tips' });
    expect(second.body.author).toMatchObject({ name: 'Principal', role: 'principal', photoUrl: null });

    const page = await feed(principal);
    expect(page.data[0].id).toBe(second.body.id);
    // Principals/directors can open a teacher author's profile.
    expect(page.data.find((p: { id: string }) => p.id === first.body.id).author.teacherId).toBe(teacher.profileId);
    const tagged = await feed(principal, '?tag=exam-prep&limit=50');
    expect(tagged.data.every((p: { tag: { slug: string } }) => p.tag.slug === 'exam-prep')).toBe(true);
    // Cursor pagination.
    const one = await feed(principal, '?limit=1');
    const next = await feed(principal, `?limit=1&before=${one.nextBefore}`);
    expect(next.data[0].id).not.toBe(one.data[0].id);

    await t.http.get('/api/v1/community/posts').expect(401);
    await t.http.get('/api/v1/community/posts').set('Authorization', admin.auth).expect(403);
  });

  it('validation: length, phone numbers, unknown tag, empty post', async () => {
    const teacher = await publishedTeacher(t);
    const long = await post(teacher, { body: 'x'.repeat(COMMUNITY_POST_MAX_CHARS + 1) }, 400);
    expect(long.body.error.details.issues[0].path).toBe('body');
    for (const phone of ['Call me on 08031234567', 'WhatsApp +234 803 123 4567', 'ring 0803-123-4567']) {
      const res = await post(teacher, { body: phone }, 400);
      expect(res.body.error.details.issues[0].message).toMatch(/phone numbers/);
    }
    await post(teacher, { body: 'Hello', tag: 'not-a-tag' }, 400);
    await post(teacher, { body: '' }, 400);
    await post(teacher, { body: 'Class of 2026 had 100% pass rate' }, 201);
  });

  it('likes are one per person; comments notify the author; authors delete their own', async () => {
    const author = await publishedTeacher(t, 'Chidi Author');
    const director = await verifiedUser(t, 'director');
    const p = (await post(author, { body: 'Share your classroom management tips' })).body;

    const liked = await t.http.post(`/api/v1/community/posts/${p.id}/like`).set('Authorization', director.auth).expect(200);
    expect(liked.body).toEqual({ likes: 1, likedByMe: true });
    await t.http.post(`/api/v1/community/posts/${p.id}/like`).set('Authorization', director.auth).expect(200);
    expect((await t.http.get(`/api/v1/community/posts/${p.id}`).set('Authorization', director.auth).expect(200)).body).toMatchObject({ likes: 1, likedByMe: true });

    const c = await t.http.post(`/api/v1/community/posts/${p.id}/comments`).set('Authorization', director.auth).send({ body: 'Seat plans help a lot' }).expect(201);
    expect(c.body).toMatchObject({ author: { name: 'Director' }, body: 'Seat plans help a lot', mine: true });
    await t.http.post(`/api/v1/community/posts/${p.id}/comments`).set('Authorization', director.auth).send({ body: 'text me 08031234567' }).expect(400);
    const notices = await t.http.get('/api/v1/notifications').set('Authorization', author.auth).expect(200);
    expect(notices.body.data[0]).toMatchObject({ type: 'community_comment', title: 'Director commented on your post', link: `/teacher/community/${p.id}` });
    expect(t.mailer.lastTo(author.email)!.subject).toBe('Director commented on your post on EDU-FORUM');

    await t.http.post(`/api/v1/community/comments/${c.body.id}/like`).set('Authorization', author.auth).expect(200);
    const list = await t.http.get(`/api/v1/community/posts/${p.id}/comments`).set('Authorization', author.auth).expect(200);
    expect(list.body.data[0]).toMatchObject({ likes: 1, likedByMe: true });
    expect((await t.http.get(`/api/v1/community/posts/${p.id}`).set('Authorization', author.auth).expect(200)).body.comments).toBe(1);

    // Only the author deletes.
    await t.http.delete(`/api/v1/community/comments/${c.body.id}`).set('Authorization', author.auth).expect(404);
    await t.http.delete(`/api/v1/community/comments/${c.body.id}`).set('Authorization', director.auth).expect(204);
    await t.http.delete(`/api/v1/community/posts/${p.id}`).set('Authorization', director.auth).expect(404);
    await t.http.delete(`/api/v1/community/posts/${p.id}`).set('Authorization', author.auth).expect(204);
    await t.http.get(`/api/v1/community/posts/${p.id}`).set('Authorization', director.auth).expect(404);
    const unliked = await t.http.post(`/api/v1/community/posts/${p.id}/like`).set('Authorization', director.auth);
    expect(unliked.status).toBe(404);
  });

  it('photos appear only after a clean scan; infected ones are dropped', async () => {
    const teacher = await publishedTeacher(t);
    const good = await uploadFile(t, teacher.auth, 'community_photo', 'class.png', 'image/png', PNG);
    const bad = await uploadFile(t, teacher.auth, 'community_photo', 'bad.png', 'image/png', Buffer.concat([PNG, Buffer.from(EICAR)]));
    const p = await post(teacher, { body: 'Our science fair', uploadIds: [good, bad] });
    // Inline queue: scans have run by now.
    const fresh = await t.http.get(`/api/v1/community/posts/${p.body.id}`).set('Authorization', teacher.auth).expect(200);
    expect(fresh.body.photos).toEqual([{ id: expect.any(String), status: 'ready', url: expect.stringMatching(/^memory:\/\/get\//) }]);
    // A photo can be used once; at most 4.
    await post(teacher, { body: 'again', uploadIds: [good] }, 409);
    await post(teacher, { body: 'many', uploadIds: Array.from({ length: 5 }, () => good) }, 400);
  });

  it('sharing a job keeps an anonymous school hidden; only live jobs can be shared', async () => {
    const director = await verifiedUser(t, 'director');
    const teacher = await publishedTeacher(t);
    const anon = await liveVacancy(t, director, { locationVisibility: 'anonymous', schoolName: 'Secret Heights College', schoolType: 'secondary' });
    const p = await post(teacher, { body: 'Good one for physics teachers', vacancyId: anon.id });
    expect(p.body.job).toMatchObject({ id: anon.id, title: 'SS2 Physics Teacher', place: 'Ikeja, Lagos', open: true });
    expect(p.body.job.path).toMatch(/^\/jobs\/ss2-physics-teacher-ikeja-[a-z0-9]{8}$/);
    const asOwner = await t.http.get(`/api/v1/community/posts/${p.body.id}`).set('Authorization', director.auth).expect(200);
    expect(JSON.stringify(asOwner.body)).not.toContain('Secret Heights College');
    expect(JSON.stringify(p.body)).not.toMatch(/"lat"|"lng"|addressLine/);

    await t.http.post(`/api/v1/vacancies/${anon.id}/close`).set('Authorization', director.auth).send({ reason: 'filled' }).expect(200);
    expect((await t.http.get(`/api/v1/community/posts/${p.body.id}`).set('Authorization', teacher.auth).expect(200)).body.job.open).toBe(false);
    await post(teacher, { body: 'share closed', vacancyId: anon.id }, 422);
  });

  it('blocking hides both sides from each other', async () => {
    const a = await publishedTeacher(t, 'Blocker Bee');
    const b = await verifiedUser(t, 'principal');
    const pa = (await post(a, { body: 'Post by A' })).body;
    const pb = (await post(b, { body: 'Post by B' })).body;
    await t.http.post('/api/v1/community/blocks').set('Authorization', a.auth).send({ userId: b.userId }).expect(204);
    await t.http.post('/api/v1/community/blocks').set('Authorization', a.auth).send({ userId: a.userId }).expect(422);

    const ids = (page: { data: { id: string }[] }) => page.data.map((p) => p.id);
    expect(ids(await feed(a, '?limit=50'))).not.toContain(pb.id);
    expect(ids(await feed(b, '?limit=50'))).not.toContain(pa.id);
    await t.http.post(`/api/v1/community/posts/${pa.id}/comments`).set('Authorization', b.auth).send({ body: 'hi' }).expect(404);
    expect((await t.http.get('/api/v1/community/blocks').set('Authorization', a.auth).expect(200)).body).toEqual([expect.objectContaining({ userId: b.userId, name: 'Principal' })]);

    await t.http.delete(`/api/v1/community/blocks/${b.userId}`).set('Authorization', a.auth).expect(204);
    expect(ids(await feed(b, '?limit=50'))).toContain(pa.id);
  });

  it('report → admin removes the post; the author is told why; audit-logged', async () => {
    const author = await publishedTeacher(t);
    const reporter = await verifiedUser(t, 'director');
    const p = (await post(author, { body: 'Buy my exam leaks' })).body;
    const c = (await t.http.post(`/api/v1/community/posts/${p.id}/comments`).set('Authorization', author.auth).send({ body: 'DM me' }).expect(201)).body;
    await t.http.post('/api/v1/reports').set('Authorization', reporter.auth).send({ targetType: 'community_post', targetId: p.id, reason: 'scam_or_fraud' }).expect(201);
    await t.http.post('/api/v1/reports').set('Authorization', author.auth).send({ targetType: 'community_post', targetId: p.id, reason: 'spam' }).expect(422);
    await t.http.post('/api/v1/reports').set('Authorization', reporter.auth).send({ targetType: 'community_comment', targetId: c.id, reason: 'spam' }).expect(201);
    const reports = await t.http.get('/api/v1/admin/reports').set('Authorization', admin.auth).expect(200);
    expect(reports.body.data.find((r: { targetId: string }) => r.targetId === p.id)).toMatchObject({ targetType: 'community_post', targetLabel: 'Buy my exam leaks' });

    await t.http.post(`/api/v1/admin/community/comments/${c.id}/remove`).set('Authorization', admin.auth).send({ reason: 'Spam' }).expect(200);
    await t.http.post(`/api/v1/admin/community/posts/${p.id}/remove`).set('Authorization', admin.auth).send({ reason: 'Selling exam leaks' }).expect(200);
    await t.http.post(`/api/v1/admin/community/posts/${p.id}/remove`).set('Authorization', reporter.auth).send({ reason: 'x' }).expect(403);
    await t.http.get(`/api/v1/community/posts/${p.id}`).set('Authorization', reporter.auth).expect(404);
    expect(t.mailer.lastTo(author.email)!.text).toContain('Reason: Selling exam leaks');
    expect(await t.prisma.auditLog.count({ where: { action: 'community.post.remove', targetId: p.id } })).toBe(1);
  });

  it('new posts and counts go live to the community room', async () => {
    const watcher = await verifiedUser(t, 'director');
    const writer = await publishedTeacher(t);
    const port = (t.app.getHttpServer().address() as AddressInfo).port;
    const socket: Socket = io(`http://localhost:${port}`, { path: '/ws', auth: { token: watcher.auth.slice(7) }, transports: ['websocket'], reconnection: false });
    await new Promise<void>((resolve, reject) => {
      socket.on('connect', () => setTimeout(resolve, 100));
      socket.on('connect_error', reject);
    });
    const events: [string, unknown][] = [];
    for (const e of Object.values(COMMUNITY_WS_EVENTS)) socket.on(e, (d) => events.push([e, d]));
    const p = (await post(writer, { body: 'Live hello' })).body;
    await t.http.post(`/api/v1/community/posts/${p.id}/like`).set('Authorization', watcher.auth).expect(200);
    await new Promise((r) => setTimeout(r, 300));
    socket.disconnect();
    expect(events).toEqual(
      expect.arrayContaining([
        [COMMUNITY_WS_EVENTS.newPost, { postId: p.id, authorId: writer.userId }],
        [COMMUNITY_WS_EVENTS.postUpdated, { postId: p.id, likes: 1, comments: 0 }],
      ]),
    );
  });

  it('erasing an account removes its posts, comments and likes', async () => {
    const leaving = await publishedTeacher(t, 'Leaving Lola');
    const other = await verifiedUser(t, 'principal');
    const mine = (await post(leaving, { body: 'Goodbye post' })).body;
    const theirs = (await post(other, { body: 'Staying post' })).body;
    await t.http.post(`/api/v1/community/posts/${theirs.id}/like`).set('Authorization', leaving.auth).expect(200);
    await t.http.post(`/api/v1/community/posts/${theirs.id}/comments`).set('Authorization', leaving.auth).send({ body: 'Bye all' }).expect(201);
    const { AccountDeletionService } = await import('../src/modules/users/account-deletion.service');
    await t.app.get(AccountDeletionService).erase(leaving.userId);
    await t.prisma.user.update({ where: { id: leaving.userId }, data: { email: leaving.email } });

    await t.http.get(`/api/v1/community/posts/${mine.id}`).set('Authorization', other.auth).expect(404);
    const after = await t.http.get(`/api/v1/community/posts/${theirs.id}`).set('Authorization', other.auth).expect(200);
    expect(after.body).toMatchObject({ likes: 0, comments: 0 });
    expect((await t.prisma.communityPost.findUniqueOrThrow({ where: { id: mine.id } })).body).toBe('');
  });
});
