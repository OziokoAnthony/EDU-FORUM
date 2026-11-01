import Link from 'next/link';
import { APP_NAME } from '@edu-forum/shared';
import { StaticPage, staticMetadata } from '@/components/public/static-page';

export const generateMetadata = () => staticMetadata('/about');

export default function Page() {
  return (
    <StaticPage path="/about" intro={`${APP_NAME} is a free recruitment and community platform for teachers, principals and directors in every Nigerian state and the FCT.`}>
      <h2>For teachers</h2>
      <ul>
        <li>Build your profile once: qualifications, certifications such as TRCN, experience, the subjects and levels you teach, and your CV.</li>
        <li>Find jobs near you by subject, level, salary and distance, and apply free with your CV.</li>
        <li>Get invited by schools, chat with principals and directors, and track every application and interview.</li>
      </ul>

      <h2>For principals and directors</h2>
      <ul>
        <li>Post vacancies with your school&apos;s name, or anonymously when you need to.</li>
        <li>Search qualified teachers by subject, level and location, view their CVs and message them.</li>
        <li>Shortlist, schedule interviews and hire, all in one place.</li>
      </ul>

      <h2>A community for educators</h2>
      <p>
        Members share ideas, lesson tips and news in the <strong>community feed</strong>, and write for our <Link href="/blog">blog</Link> on careers, exam preparation and school
        life.
      </p>

      <h2>Free, always</h2>
      <p>
        {APP_NAME} never charges to apply or to post a job. Adverts on public pages pay for the service. If anyone asks you to pay for a job, it is a scam: read our{' '}
        <Link href="/safety">safety tips</Link>.
      </p>

      <p>
        <Link href="/register">Join free</Link> or <Link href="/jobs">browse teaching jobs</Link>. Questions? <Link href="/contact">Contact us</Link>.
      </p>
    </StaticPage>
  );
}
