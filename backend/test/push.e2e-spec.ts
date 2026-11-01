import { PushService } from '../src/modules/push/push.module';
import { NotificationsService } from '../src/modules/notifications/notifications.service';
import { createTestApp, deleteTestUsers, verifiedUser, type TestApp } from './utils';

const sub = (n: number) => ({ endpoint: `https://push.example.test/send/device-${n}-${Date.now()}`, keys: { p256dh: 'BPublicKeyOfTheDeviceForTests1234567890', auth: 'authSecret123' } });

describe('Push alerts (e2e)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await deleteTestUsers(t.prisma);
    await t.close();
  });

  it('devices subscribe; every notification is pushed to each of the user’s devices; unsubscribing and deleting the account stop it', async () => {
    expect((await t.http.get('/api/v1/push/public-key').expect(200)).body.publicKey).toBe('BTestPublicKeyForE2EOnly');
    const teacher = await verifiedUser(t);
    const other = await verifiedUser(t, 'principal');
    const phone = sub(1);
    const laptop = sub(2);
    await t.http.post('/api/v1/me/push-subscriptions').send(phone).expect(401);
    await t.http.post('/api/v1/me/push-subscriptions').set('Authorization', teacher.auth).send({ endpoint: 'not a url', keys: phone.keys }).expect(400);
    await t.http.post('/api/v1/me/push-subscriptions').set('Authorization', teacher.auth).send(phone).expect(204);
    await t.http.post('/api/v1/me/push-subscriptions').set('Authorization', teacher.auth).send(laptop).expect(204);
    // Subscribing again is harmless.
    await t.http.post('/api/v1/me/push-subscriptions').set('Authorization', teacher.auth).send(phone).expect(204);
    expect(await t.prisma.pushSubscription.count({ where: { userId: teacher.userId } })).toBe(2);

    const push = t.app.get(PushService);
    const notifications = t.app.get(NotificationsService);
    const before = push.sent.length;
    await notifications.notify({ userId: teacher.userId, type: 'status_change', title: 'You were shortlisted', body: 'Physics Teacher at Greenfield', link: '/teacher/applications' });
    const sent = push.sent.slice(before);
    expect(sent.map((s) => s.endpoint).sort()).toEqual([phone.endpoint, laptop.endpoint].sort());
    expect(sent[0].payload).toEqual({ title: 'You were shortlisted', body: 'Physics Teacher at Greenfield', link: '/teacher/applications', tag: 'status_change' });

    // Someone else cannot remove my device; I can.
    await t.http.delete('/api/v1/me/push-subscriptions').set('Authorization', other.auth).send({ endpoint: phone.endpoint }).expect(204);
    expect(await t.prisma.pushSubscription.count({ where: { userId: teacher.userId } })).toBe(2);
    await t.http.delete('/api/v1/me/push-subscriptions').set('Authorization', teacher.auth).send({ endpoint: phone.endpoint }).expect(204);
    const mid = push.sent.length;
    await notifications.notify({ userId: teacher.userId, type: 'message', title: 'New message', body: 'Hello', link: '/teacher/messages' });
    expect(push.sent.slice(mid).map((s) => s.endpoint)).toEqual([laptop.endpoint]);

    // Asking to delete the account forgets every device.
    await t.http.delete('/api/v1/me').set('Authorization', teacher.auth).expect(202);
    expect(await t.prisma.pushSubscription.count({ where: { userId: teacher.userId } })).toBe(0);
  });
});
