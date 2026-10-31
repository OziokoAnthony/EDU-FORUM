import type { AddressInfo } from 'node:net';
import { io, type Socket } from 'socket.io-client';
import { WS_EVENTS, type NotificationItem } from '@edu-forum/shared';
import { NotificationsService } from '../src/modules/notifications/notifications.service';
import { createTestApp, deleteTestUsers, verifiedUser, type SignedInUser, type TestApp } from './utils';

describe('Notifications (e2e)', () => {
  let t: TestApp;
  let notifications: NotificationsService;

  beforeAll(async () => {
    t = await createTestApp();
    notifications = t.app.get(NotificationsService);
    // The gateway needs a real listening server for socket clients.
    await t.app.listen(0);
  });

  afterAll(async () => {
    await deleteTestUsers(t.prisma);
    await t.close();
  });

  const mail = (to: string, subject: string) => ({ to, subject, text: subject });
  const send = (u: SignedInUser, type: 'status_change' | 'message' | 'moderation', subject: string, alwaysEmail = false) =>
    notifications.notify({ userId: u.userId, type, title: subject, body: `${subject} body`, link: '/teacher', email: mail(u.email, subject), alwaysEmail });

  it('lists, counts and marks notifications read; only the owner can read them', async () => {
    const me = await verifiedUser(t);
    const other = await verifiedUser(t);
    await send(me, 'status_change', 'First');
    await send(me, 'status_change', 'Second');

    const list = await t.http.get('/api/v1/notifications').set('Authorization', me.auth).expect(200);
    expect(list.body.meta.total).toBe(2);
    expect(list.body.data.map((n: NotificationItem) => n.title)).toEqual(['Second', 'First']);
    expect(list.body.data[0]).toMatchObject({ type: 'status_change', body: 'Second body', link: '/teacher', read: false });
    expect((await t.http.get('/api/v1/notifications/unread-count').set('Authorization', me.auth).expect(200)).body).toEqual({ count: 2 });

    const id = list.body.data[0].id as string;
    await t.http.post(`/api/v1/notifications/${id}/read`).set('Authorization', other.auth).expect(404);
    expect((await t.http.post(`/api/v1/notifications/${id}/read`).set('Authorization', me.auth).expect(200)).body.read).toBe(true);
    const unread = await t.http.get('/api/v1/notifications?unread=true').set('Authorization', me.auth).expect(200);
    expect(unread.body.data.map((n: NotificationItem) => n.title)).toEqual(['First']);

    expect((await t.http.post('/api/v1/notifications/read-all').set('Authorization', me.auth).expect(200)).body).toEqual({ updated: 1 });
    expect((await t.http.get('/api/v1/notifications/unread-count').set('Authorization', me.auth).expect(200)).body).toEqual({ count: 0 });
    expect((await t.http.get('/api/v1/notifications').set('Authorization', other.auth).expect(200)).body.meta.total).toBe(0);
    await t.http.get('/api/v1/notifications').expect(401);
  });

  it('email preferences: default on, switched-off categories skip the email but still notify in-app', async () => {
    const me = await verifiedUser(t);
    const prefs = await t.http.get('/api/v1/notifications/preferences').set('Authorization', me.auth).expect(200);
    expect(prefs.body.email).toEqual({ applications: true, invitations: true, interviews: true, messages: true, alerts: true, reminders: true });

    const updated = await t.http.put('/api/v1/notifications/preferences').set('Authorization', me.auth).send({ email: { messages: false } }).expect(200);
    expect(updated.body.email).toMatchObject({ messages: false, applications: true });
    // Merges: a later change keeps the earlier one.
    await t.http.put('/api/v1/notifications/preferences').set('Authorization', me.auth).send({ email: { alerts: false } }).expect(200);
    const after = await t.http.get('/api/v1/notifications/preferences').set('Authorization', me.auth).expect(200);
    expect(after.body.email).toMatchObject({ messages: false, alerts: false, applications: true });
    await t.http.put('/api/v1/notifications/preferences').set('Authorization', me.auth).send({ email: { spam: false } }).expect(400);

    await send(me, 'message', 'Chat message');
    expect(t.mailer.lastTo(me.email)?.subject).not.toBe('Chat message');
    await send(me, 'status_change', 'Status email');
    expect(t.mailer.lastTo(me.email)?.subject).toBe('Status email');

    // Moderation notices are emailed whatever the settings say.
    await t.http.put('/api/v1/notifications/preferences').set('Authorization', me.auth).send({ email: { reminders: false } }).expect(200);
    await send(me, 'moderation', 'Profile hidden', true);
    expect(t.mailer.lastTo(me.email)?.subject).toBe('Profile hidden');

    const list = await t.http.get('/api/v1/notifications').set('Authorization', me.auth).expect(200);
    expect(list.body.data.map((n: NotificationItem) => n.title)).toEqual(['Profile hidden', 'Status email', 'Chat message']);
  });

  describe('/ws', () => {
    const sockets: Socket[] = [];
    afterEach(() => sockets.splice(0).forEach((s) => s.disconnect()));

    const connect = (token?: string) => {
      const { port } = t.app.getHttpServer().address() as AddressInfo;
      const socket = io(`http://localhost:${port}`, { path: '/ws', auth: token ? { token } : {}, transports: ['websocket'], reconnection: false });
      sockets.push(socket);
      return socket;
    };
    const next = <T>(socket: Socket, event: string) => new Promise<T>((resolve) => socket.once(event, resolve));

    it('pushes new notifications and the unread count to the signed-in user only', async () => {
      const me = await verifiedUser(t);
      const other = await verifiedUser(t);
      const mine = connect(me.auth.replace('Bearer ', ''));
      const theirs = connect(other.auth.replace('Bearer ', ''));
      await Promise.all([next(mine, 'connect'), next(theirs, 'connect')]);
      // Joining the room happens after the async token check; give it a moment.
      await new Promise((r) => setTimeout(r, 200));

      let leaked = false;
      theirs.on(WS_EVENTS.notification, () => (leaked = true));
      const pushed = next<NotificationItem>(mine, WS_EVENTS.notification);
      const count = next<{ count: number }>(mine, WS_EVENTS.unreadCount);
      await send(me, 'status_change', 'Live one');
      expect(await pushed).toMatchObject({ title: 'Live one', read: false });
      expect(await count).toEqual({ count: 1 });
      await new Promise((r) => setTimeout(r, 100));
      expect(leaked).toBe(false);
    });

    it('drops connections without a valid token', async () => {
      const socket = connect('not-a-token');
      await next(socket, 'disconnect');
      expect(socket.connected).toBe(false);
    });
  });
});
