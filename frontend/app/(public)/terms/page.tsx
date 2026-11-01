import Link from 'next/link';
import { APP_NAME, LEGAL } from '@edu-forum/shared';
import { StaticPage, staticMetadata } from '@/components/public/static-page';

export const generateMetadata = () => staticMetadata('/terms');

/** Terms of use. Plain English; have a lawyer review before launch. */
export default function Page() {
  return (
    <StaticPage path="/terms" legal intro={`These terms are the agreement between you and ${LEGAL.operatorName} for using ${APP_NAME}. By creating an account you accept them.`}>
      <h2>1. The service</h2>
      <p>
        {APP_NAME} helps teachers find jobs and helps principals and directors find teachers. It is <strong>free</strong>: we never charge teachers to apply or schools to post
        vacancies, and we pay for the service with adverts on public pages. Anyone who asks you for money to get a job through {APP_NAME} is not acting for us: see our{' '}
        <Link href="/safety">safety tips</Link>.
      </p>

      <h2>2. Your account</h2>
      <ul>
        <li>You must be 18 or older and give true information.</li>
        <li>Keep your password private. You are responsible for what happens in your account.</li>
        <li>One person, one account. Do not sign up on someone else&apos;s behalf without their permission.</li>
      </ul>

      <h2>3. Teachers</h2>
      <ul>
        <li>Your qualifications, certifications, experience and CV must be genuine and your own.</li>
        <li>When your profile is published, signed-in principals and directors can see your contact details and CV, as explained in the <Link href="/privacy">privacy policy</Link>.</li>
      </ul>

      <h2>4. Principals and directors</h2>
      <ul>
        <li>Only post real vacancies you are allowed to fill, with an honest salary range and location.</li>
        <li>Never ask applicants for money, &quot;forms&quot;, training fees or bank details.</li>
        <li>Use teachers&apos; contact details and CVs only to recruit for your school. Do not sell or share them.</li>
        <li>Do not discriminate unlawfully.</li>
      </ul>

      <h2>5. Community, blog and chat</h2>
      <ul>
        <li>Be respectful. No harassment, hate, threats, sexual content or false claims about others.</li>
        <li>Do not share phone numbers in community posts, blog posts or comments: use chat.</li>
        <li>No spam, advertising for other services or links to scams. Only post photos and writing you have the right to share.</li>
        <li>Blog posts are checked by an admin before they become public.</li>
        <li>You keep ownership of what you write and upload. You allow us to show it on {APP_NAME} for as long as it stays up.</li>
      </ul>

      <h2>6. Moderation</h2>
      <p>
        Anyone can report a vacancy, profile, message, post or comment. Our admins may remove content, hide profiles, take down vacancies or suspend accounts that break these terms,
        and we tell you why. Serious cases, such as fraud, may be reported to the authorities.
      </p>

      <h2>7. No guarantee</h2>
      <p>
        We do not employ teachers or check every claim made by users. We cannot promise that you will get a job or find a teacher, or that every vacancy or profile is accurate.
        Check details yourself before you accept an offer or hire someone.
      </p>

      <h2>8. Liability</h2>
      <p>
        We provide {APP_NAME} &quot;as is&quot;. As far as the law allows, we are not liable for losses caused by other users, by content they post, or by the service being
        unavailable. Nothing in these terms limits rights you have under Nigerian consumer law.
      </p>

      <h2>9. Leaving</h2>
      <p>You can delete your account at any time from your Account page. We may close accounts that break these terms.</p>

      <h2>10. Changes and law</h2>
      <p>
        We may update these terms and will show the date at the top; important changes will be announced. These terms are governed by the laws of the Federal Republic of Nigeria.
        Questions: {LEGAL.email} or the <Link href="/contact">contact page</Link>.
      </p>
    </StaticPage>
  );
}
