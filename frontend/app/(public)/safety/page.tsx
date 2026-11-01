import Link from 'next/link';
import { APP_NAME } from '@edu-forum/shared';
import { StaticPage, staticMetadata } from '@/components/public/static-page';

export const generateMetadata = () => staticMetadata('/safety');

export default function Page() {
  return (
    <StaticPage path="/safety" intro="Most schools on EDU-FORUM are genuine, but scammers sometimes pretend to be employers. These tips help you stay safe.">
      <h2>Never pay to get a job</h2>
      <p>
        {APP_NAME} is free, and real schools do not charge teachers to apply, to be interviewed or to start work. Walk away from anyone who asks for an &quot;application
        fee&quot;, &quot;form fee&quot;, &quot;training fee&quot;, uniform money or a deposit.
      </p>

      <h2>Warning signs of a fake job</h2>
      <ul>
        <li>The salary is far higher than similar jobs, or they offer the job without an interview.</li>
        <li>They push you to decide or pay quickly.</li>
        <li>They will not tell you the school&apos;s address, or the address does not exist.</li>
        <li>They ask for your BVN, ATM card, PIN, bank login or one-time codes. Never share these.</li>
        <li>They ask you to move the conversation away from {APP_NAME} straight away.</li>
      </ul>

      <h2>Check the school</h2>
      <ul>
        <li>Look the school up, call its official number, or visit it before you resign from your current job.</li>
        <li>Ask for a written offer showing your salary, duties and start date.</li>
      </ul>

      <h2>Interview safely</h2>
      <ul>
        <li>Meet at the school or another public place, in the daytime.</li>
        <li>Tell a friend or family member where you are going and when you expect to be back.</li>
        <li>For video interviews, use the link shared in your {APP_NAME} interview details.</li>
      </ul>

      <h2>Report anything suspicious</h2>
      <p>
        Use the <strong>Report</strong> button on the job, profile, message or post, or <Link href="/contact">contact us</Link> and choose &quot;Report a scam or a safety
        problem&quot;. Our team reviews every report. If you have lost money, also report it to the police.
      </p>
    </StaticPage>
  );
}
