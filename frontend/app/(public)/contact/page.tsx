import Link from 'next/link';
import { LEGAL } from '@edu-forum/shared';
import { StaticPage, staticMetadata } from '@/components/public/static-page';
import { ContactForm } from './contact-form';

export const generateMetadata = () => staticMetadata('/contact');

export default function Page() {
  return (
    <StaticPage path="/contact" intro="Send us a message and we will reply by email, usually within two working days.">
      <p>
        Reporting a fake job or a safety problem? Use the <strong>Report</strong> button on the job, profile, message or post if you can, and read our{' '}
        <Link href="/safety">safety tips</Link>. You can also email {LEGAL.email}.
      </p>
      <ContactForm />
    </StaticPage>
  );
}
