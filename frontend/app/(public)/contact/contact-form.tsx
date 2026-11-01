'use client';

import { useState } from 'react';
import {
  CONTACT_MESSAGE_MAX,
  CONTACT_TOPIC_LABELS,
  CONTACT_TOPICS,
  contactSchema,
} from '@edu-forum/shared';
import { Alert, Button } from '@/components/ui';
import { api, ApiError } from '@/lib/api';

/** Contact form: validated with the shared schema here and again on the server. */
export function ContactForm() {
  const [form, setForm] = useState({ name: '', email: '', topic: '', message: '', website: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);
  const set =
    (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm({ ...form, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const checked = contactSchema.safeParse(form);
    if (!checked.success) {
      setErrors(
        Object.fromEntries(checked.error.issues.map((i) => [String(i.path[0]), i.message])),
      );
      return;
    }
    setErrors({});
    setState('sending');
    try {
      await api('/contact', { method: 'POST', body: form });
      setState('sent');
    } catch (err) {
      setState('idle');
      if (err instanceof ApiError) {
        setErrors(err.fieldErrors());
        setError(
          err.message === 'Validation failed' ? 'Please fix the highlighted fields.' : err.message,
        );
      } else setError('Could not send. Check your connection and try again.');
    }
  }

  if (state === 'sent')
    return (
      <Alert kind="success">
        Thank you. Your message has reached our team and we will reply to {form.email}.
      </Alert>
    );

  const input =
    'block w-full rounded-md border border-slate-300 px-3 py-2.5 text-base outline-none focus:border-brand focus:ring-2 focus:ring-brand/20';
  const err = (k: string) =>
    errors[k] ? (
      <p id={`${k}-error`} className="text-sm text-red-600">
        {errors[k]}
      </p>
    ) : null;

  return (
    <form onSubmit={submit} noValidate className="not-prose space-y-4">
      <div className="space-y-1">
        <label htmlFor="contact-name" className="block text-sm font-medium text-slate-800">
          Your name
        </label>
        <input
          id="contact-name"
          value={form.name}
          onChange={set('name')}
          autoComplete="name"
          aria-invalid={!!errors.name}
          aria-describedby={errors.name ? 'name-error' : undefined}
          className={input}
        />
        {err('name')}
      </div>
      <div className="space-y-1">
        <label htmlFor="contact-email" className="block text-sm font-medium text-slate-800">
          Email address
        </label>
        <input
          id="contact-email"
          type="email"
          value={form.email}
          onChange={set('email')}
          autoComplete="email"
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? 'email-error' : undefined}
          className={input}
        />
        {err('email')}
      </div>
      <div className="space-y-1">
        <label htmlFor="contact-topic" className="block text-sm font-medium text-slate-800">
          Topic
        </label>
        <select
          id="contact-topic"
          value={form.topic}
          onChange={set('topic')}
          aria-invalid={!!errors.topic}
          aria-describedby={errors.topic ? 'topic-error' : undefined}
          className={input}
        >
          <option value="">Choose a topic</option>
          {CONTACT_TOPICS.map((t) => (
            <option key={t} value={t}>
              {CONTACT_TOPIC_LABELS[t]}
            </option>
          ))}
        </select>
        {err('topic')}
      </div>
      <div className="space-y-1">
        <label htmlFor="contact-message" className="block text-sm font-medium text-slate-800">
          Message
        </label>
        <textarea
          id="contact-message"
          rows={6}
          maxLength={CONTACT_MESSAGE_MAX}
          value={form.message}
          onChange={set('message')}
          aria-invalid={!!errors.message}
          aria-describedby={errors.message ? 'message-error' : undefined}
          className={input}
        />
        <p className="text-xs text-slate-500">
          Please do not include links. Never send passwords or bank details.
        </p>
        {err('message')}
      </div>
      {/* Hidden from people; bots that fill every field are refused. */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="contact-website">Website</label>
        <input
          id="contact-website"
          tabIndex={-1}
          autoComplete="off"
          value={form.website}
          onChange={set('website')}
        />
      </div>
      {error ? <Alert>{error}</Alert> : null}
      <Button type="submit" loading={state === 'sending'}>
        Send message
      </Button>
    </form>
  );
}
