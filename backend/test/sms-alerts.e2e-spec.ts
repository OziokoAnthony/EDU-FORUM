import type { ConfigService } from '@nestjs/config';
import { Geocoder } from '../src/infra/geocoder';
import { ResendMailer } from '../src/infra/mail/resend.mailer';
import { SMS_SENDER, TermiiSmsSender, type MemorySmsSender } from '../src/infra/sms/sms-sender';
import { NotificationsService } from '../src/modules/notifications/notifications.service';
import { createTestApp, deleteTestUsers, verifiedUser, type TestApp } from './utils';

/** A fetch stand-in that records the request and answers like the provider. */
function fakeFetch(body: unknown, status = 200) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fn = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

describe('SMS / WhatsApp alerts and production providers (e2e)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await deleteTestUsers(t.prisma);
    await t.close();
  });

  it('texts go only for categories the user switched on, only to a confirmed phone, in one SMS page', async () => {
    const teacher = await verifiedUser(t);
    const phone = `+23480${String(Date.now()).slice(-8)}`;
    const notifications = t.app.get(NotificationsService);
    const sms = t.app.get(SMS_SENDER) as MemorySmsSender;
    const notify = (smsCategory?: 'application_updates' | 'interviews' | 'invitations') =>
      notifications.notify({ userId: teacher.userId, type: 'status_change', smsCategory, title: 'Your application: Shortlisted', body: 'Physics Teacher at Greenfield Academy is now shortlisted. '.repeat(4), link: '/teacher/applications' });

    // Defaults: off, no phone yet.
    const prefs = await t.http.get('/api/v1/notifications/preferences').set('Authorization', teacher.auth).expect(200);
    expect(prefs.body).toMatchObject({ sms: { application_updates: false, interviews: false, invitations: false }, smsChannel: 'sms', phone: null, phoneVerified: false, smsAvailable: true });

    await t.http.put('/api/v1/notifications/preferences').set('Authorization', teacher.auth).send({ sms: { application_updates: true }, smsChannel: 'whatsapp' }).expect(200);
    let before = sms.sent.length;
    await notify('application_updates');
    expect(sms.sent.length).toBe(before); // no confirmed phone

    await t.prisma.user.update({ where: { id: teacher.userId }, data: { phone, phoneVerifiedAt: new Date() } });
    before = sms.sent.length;
    await notify('application_updates');
    await notify('interviews'); // category still off
    await notify(); // not an SMS-worthy notice
    const sent = sms.sent.slice(before);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: phone, channel: 'whatsapp' });
    expect(sent[0].text.startsWith('EDU-FORUM: Your application: Shortlisted.')).toBe(true);
    expect(sent[0].text.endsWith(' http://localhost:3000/teacher/applications')).toBe(true);
    expect(sent[0].text.length).toBeLessThanOrEqual(160);

    // Email settings are untouched by SMS changes, and vice versa.
    const after = await t.http.put('/api/v1/notifications/preferences').set('Authorization', teacher.auth).send({ email: { messages: false } }).expect(200);
    expect(after.body).toMatchObject({ email: { messages: false, applications: true }, sms: { application_updates: true }, smsChannel: 'whatsapp', phone, phoneVerified: true });
  });

  it('Termii, Resend and Google Geocoding are called the way their APIs expect', async () => {
    const termii = fakeFetch({ code: 'ok' });
    await new TermiiSmsSender('termii-key', 'EDUFORUM', 'https://api.ng.termii.com/', 'dnd', termii.fn).send({ to: '+2348031234567', text: 'Hello', channel: 'whatsapp' });
    expect(termii.calls[0].url).toBe('https://api.ng.termii.com/api/sms/send');
    expect(JSON.parse(String(termii.calls[0].init?.body))).toEqual({ api_key: 'termii-key', to: '2348031234567', from: 'EDUFORUM', sms: 'Hello', type: 'plain', channel: 'whatsapp' });
    await new TermiiSmsSender('k', 'EDUFORUM', 'https://api.ng.termii.com', 'dnd', termii.fn).send({ to: '+2348031234567', text: 'Code 123456' });
    expect(JSON.parse(String(termii.calls[1].init?.body)).channel).toBe('dnd');
    await expect(new TermiiSmsSender('k', 'X', 'https://api.ng.termii.com', 'dnd', fakeFetch({ message: 'bad key' }, 401).fn).send({ to: '+234', text: 'x' })).rejects.toThrow(/Termii 401/);

    const resend = fakeFetch({ id: 'email-1' });
    await new ResendMailer('re_key', 'EDU-FORUM <no-reply@eduforum.ng>', resend.fn).send({ to: 'ada@example.com', subject: 'Hi', text: 'Hello' });
    expect(resend.calls[0].url).toBe('https://api.resend.com/emails');
    expect((resend.calls[0].init?.headers as Record<string, string>).Authorization).toBe('Bearer re_key');
    expect(JSON.parse(String(resend.calls[0].init?.body))).toEqual({ from: 'EDU-FORUM <no-reply@eduforum.ng>', to: ['ada@example.com'], subject: 'Hi', text: 'Hello' });

    const google = fakeFetch({ status: 'OK', results: [{ formatted_address: 'Allen Ave, Ikeja, Lagos, Nigeria', geometry: { location: { lat: 6.6, lng: 3.35 } } }] });
    const config = { get: (k: string) => ({ GEOCODER_DRIVER: 'google', GOOGLE_MAPS_API_KEY: 'maps-key' })[k] } as unknown as ConfigService;
    expect(await new Geocoder(config).search('Allen Avenue Ikeja', google.fn)).toEqual([{ lat: 6.6, lng: 3.35, label: 'Allen Ave, Ikeja, Lagos, Nigeria' }]);
    expect(google.calls[0].url).toContain('components=country:NG');
    expect(google.calls[0].url).toContain('key=maps-key');
    // Local stub: nothing, no call.
    const stub = { get: () => 'stub' } as unknown as ConfigService;
    expect(await new Geocoder(stub).search('anything', google.fn)).toEqual([]);
  });
});
