import type { MessageItem } from '@edu-forum/shared';
import { publishedTeacher } from './fixtures';
import { createTestApp, deleteTestUsers, PDF, uploadFile, verifiedUser, type SignedInUser, type TestApp } from './utils';

describe('Messaging (e2e)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await deleteTestUsers(t.prisma);
    await t.close();
  });

  async function chat(): Promise<{ leader: SignedInUser; teacher: SignedInUser & { profileId: string }; id: string }> {
    const leader = await verifiedUser(t, 'director');
    const teacher = await publishedTeacher(t, 'Amaka Nwosu');
    const res = await t.http.post('/api/v1/conversations').set('Authorization', leader.auth).send({ teacherId: teacher.profileId }).expect(200);
    return { leader, teacher, id: res.body.id };
  }
  const send = (who: SignedInUser, id: string, body: Record<string, unknown>) => t.http.post(`/api/v1/conversations/${id}/messages`).set('Authorization', who.auth).send(body);

  it('a principal/director opens a chat; both sides write; teachers cannot open chats', async () => {
    const { leader, teacher, id } = await chat();
    // Opening again returns the same chat.
    const again = await t.http.post('/api/v1/conversations').set('Authorization', leader.auth).send({ teacherId: teacher.profileId }).expect(200);
    expect(again.body.id).toBe(id);
    expect(again.body.other).toMatchObject({ name: 'Amaka Nwosu', role: 'teacher', teacherId: teacher.profileId });
    await t.http.post('/api/v1/conversations').set('Authorization', teacher.auth).send({ teacherId: teacher.profileId }).expect(403);

    const first = await send(leader, id, { body: 'Hello Amaka, are you free to talk?' }).expect(201);
    expect(first.body).toMatchObject({ mine: true, body: 'Hello Amaka, are you free to talk?', readAt: null, deleted: false });
    expect(t.mailer.lastTo(teacher.email)?.subject).toBe('New message from A director');
    await send(teacher, id, { body: 'Yes, thank you!' }).expect(201);
    expect(t.mailer.lastTo(leader.email)?.subject).toBe('New message from Amaka Nwosu');

    const teacherList = await t.http.get('/api/v1/conversations').set('Authorization', teacher.auth).expect(200);
    expect(teacherList.body.data[0]).toMatchObject({ id, other: { name: 'Director', role: 'director', teacherId: null }, lastMessage: { preview: 'Yes, thank you!', mine: true }, unread: 1 });
    await send(leader, id, {}).expect(400);
  });

  it('only the first unread message notifies; "Seen" when read; cursor pagination', async () => {
    const { leader, teacher, id } = await chat();
    for (let i = 1; i <= 5; i++) await send(leader, id, { body: `Message ${i}` }).expect(201);
    const notices = await t.http.get('/api/v1/notifications').set('Authorization', teacher.auth).expect(200);
    expect(notices.body.data.filter((n: { type: string }) => n.type === 'message')).toHaveLength(1);

    const page1 = await t.http.get(`/api/v1/conversations/${id}/messages?limit=3`).set('Authorization', teacher.auth).expect(200);
    expect(page1.body.data.map((m: MessageItem) => m.body)).toEqual(['Message 3', 'Message 4', 'Message 5']);
    const page2 = await t.http.get(`/api/v1/conversations/${id}/messages?limit=3&before=${page1.body.nextBefore}`).set('Authorization', teacher.auth).expect(200);
    expect(page2.body.data.map((m: MessageItem) => m.body)).toEqual(['Message 1', 'Message 2']);
    expect(page2.body.nextBefore).toBeNull();

    expect((await t.http.post(`/api/v1/conversations/${id}/read`).set('Authorization', teacher.auth).expect(200)).body).toEqual({ updated: 5 });
    const seen = await t.http.get(`/api/v1/conversations/${id}/messages`).set('Authorization', leader.auth).expect(200);
    expect(seen.body.data.every((m: MessageItem) => m.readAt !== null)).toBe(true);
    // After reading, the next message notifies again.
    await send(leader, id, { body: 'One more thing' }).expect(201);
    const after = await t.http.get('/api/v1/notifications').set('Authorization', teacher.auth).expect(200);
    expect(after.body.data.filter((n: { type: string }) => n.type === 'message')).toHaveLength(2);
  });

  it('attachments: PDF/images only, opened only after the virus scan', async () => {
    const { leader, teacher, id } = await chat();
    const uploadId = await uploadFile(t, leader.auth, 'message_attachment', 'contract.pdf', 'application/pdf', PDF);
    const sent = await send(leader, id, { body: 'Here is the offer letter', uploadId }).expect(201);
    // Inline queue: the scan ran during the request, so the file is ready.
    const list = await t.http.get(`/api/v1/conversations/${id}/messages`).set('Authorization', teacher.auth).expect(200);
    expect(list.body.data[0].attachment).toMatchObject({ name: 'contract.pdf', mimeType: 'application/pdf', status: 'ready' });
    const link = await t.http.get(`/api/v1/conversations/${id}/messages/${sent.body.id}/attachment`).set('Authorization', teacher.auth).expect(200);
    expect(link.body.url).toContain('contract.pdf');

    await t.http
      .post('/api/v1/uploads/sign')
      .set('Authorization', leader.auth)
      .send({ purpose: 'message_attachment', fileName: 'notes.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', sizeBytes: 100 })
      .expect(400);
    await t.http
      .post('/api/v1/uploads/sign')
      .set('Authorization', leader.auth)
      .send({ purpose: 'message_attachment', fileName: 'big.pdf', mimeType: 'application/pdf', sizeBytes: 6 * 1024 * 1024 })
      .expect(400);
    // Someone else's upload cannot be attached.
    const theirs = await uploadFile(t, teacher.auth, 'message_attachment', 'cv.pdf', 'application/pdf', PDF);
    await send(leader, id, { uploadId: theirs }).expect(404);
  });

  it('delete own messages only; deleted messages show as deleted', async () => {
    const { leader, teacher, id } = await chat();
    const m = await send(leader, id, { body: 'Salary is 200k' }).expect(201);
    await t.http.delete(`/api/v1/conversations/${id}/messages/${m.body.id}`).set('Authorization', teacher.auth).expect(403);
    const del = await t.http.delete(`/api/v1/conversations/${id}/messages/${m.body.id}`).set('Authorization', leader.auth).expect(200);
    expect(del.body).toMatchObject({ deleted: true, body: null, attachment: null });
    const list = await t.http.get(`/api/v1/conversations/${id}/messages`).set('Authorization', teacher.auth).expect(200);
    expect(list.body.data[0]).toMatchObject({ deleted: true, body: null });
    expect((await t.http.get(`/api/v1/conversations/${id}`).set('Authorization', teacher.auth).expect(200)).body.lastMessage.preview).toBe('Message deleted');
    expect(await t.prisma.message.findUniqueOrThrow({ where: { id: m.body.id } })).toMatchObject({ body: null });
  });

  it('block: nobody sends while blocked; a blocked leader cannot reopen; only the blocker unblocks', async () => {
    const { leader, teacher, id } = await chat();
    await send(leader, id, { body: 'Hello' }).expect(201);
    const blocked = await t.http.post(`/api/v1/conversations/${id}/block`).set('Authorization', teacher.auth).expect(200);
    expect(blocked.body.blocked).toBe('me');
    expect((await t.http.get(`/api/v1/conversations/${id}`).set('Authorization', leader.auth).expect(200)).body.blocked).toBe('them');
    await send(leader, id, { body: 'Please reply' }).expect(422);
    await send(teacher, id, { body: 'x' }).expect(422);
    await t.http.post('/api/v1/conversations').set('Authorization', leader.auth).send({ teacherId: teacher.profileId }).expect(422);
    await t.http.post(`/api/v1/conversations/${id}/unblock`).set('Authorization', leader.auth).expect(422);
    await t.http.post(`/api/v1/conversations/${id}/unblock`).set('Authorization', teacher.auth).expect(200);
    await send(leader, id, { body: 'Thanks for unblocking' }).expect(201);
  });

  it('guards: only participants read, write, report; hidden teachers cannot be messaged', async () => {
    const { leader, teacher, id } = await chat();
    const m = await send(leader, id, { body: 'Hi' }).expect(201);
    const other = await verifiedUser(t, 'principal');
    const stranger = await publishedTeacher(t);
    for (const who of [other, stranger]) {
      await t.http.get(`/api/v1/conversations/${id}/messages`).set('Authorization', who.auth).expect(404);
      await send(who, id, { body: 'intrude' }).expect(404);
      await t.http.post('/api/v1/reports').set('Authorization', who.auth).send({ targetType: 'message', targetId: m.body.id, reason: 'spam' }).expect(404);
    }
    await t.http.post('/api/v1/reports').set('Authorization', teacher.auth).send({ targetType: 'message', targetId: m.body.id, reason: 'spam' }).expect(201);

    const hidden = await publishedTeacher(t);
    await t.prisma.teacherProfile.update({ where: { id: hidden.profileId }, data: { isPublished: false } });
    await t.http.post('/api/v1/conversations').set('Authorization', leader.auth).send({ teacherId: hidden.profileId }).expect(404);
    expect((await t.http.get('/api/v1/conversations').set('Authorization', other.auth).expect(200)).body.meta.total).toBe(0);
  });
});
