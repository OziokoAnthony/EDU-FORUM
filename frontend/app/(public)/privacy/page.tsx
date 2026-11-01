import Link from 'next/link';
import { APP_NAME, LEGAL } from '@edu-forum/shared';
import { StaticPage, staticMetadata } from '@/components/public/static-page';

export const generateMetadata = () => staticMetadata('/privacy');

/** Privacy policy (NDPA 2023). Plain English; have a lawyer review before launch. */
export default function Page() {
  return (
    <StaticPage path="/privacy" legal intro={`This policy explains what personal data ${APP_NAME} collects, why, who can see it, how long we keep it and the choices you have. It follows the Nigeria Data Protection Act 2023 (NDPA).`}>
      <h2>1. Who we are</h2>
      <p>
        {APP_NAME} is run by {LEGAL.operatorName}, {LEGAL.address} (&quot;we&quot;, &quot;us&quot;). We are the data controller for the personal data described here. Contact us about privacy at{' '}
        {LEGAL.email} or through the <Link href="/contact">contact page</Link>.
      </p>

      <h2>2. What we collect</h2>
      <ul>
        <li>
          <strong>Your account:</strong> email address or phone number, a password (stored only as a secure hash), whether you are a teacher, principal or director, and your consent
          record.
        </li>
        <li>
          <strong>Teacher profiles:</strong> name, gender, date of birth, photo, location (state, LGA, area, street address and a map pin), qualifications, certifications such as
          TRCN, work experience, teaching preferences, expected salary and your CV files.
        </li>
        <li>
          <strong>Vacancies:</strong> the details principals and directors type in, including the school name and location.
        </li>
        <li>
          <strong>Activity:</strong> applications and their status, interview details, chat messages and attachments, saved jobs and searches, community posts, blog posts,
          comments, likes, reports you make, and who viewed your profile or CV.
        </li>
        <li>
          <strong>Technical data:</strong> your IP address and device details for security and to stop abuse, and the cookies described in section 6.
        </li>
      </ul>

      <h2>3. Why we use it</h2>
      <ul>
        <li>To run the service you signed up for: profiles, job search, applications, chat, interviews and alerts (performance of a contract).</li>
        <li>To show matching jobs and teachers, keep the platform safe, prevent fraud and fix problems (legitimate interests).</li>
        <li>To send emails and texts you can switch off in your notification settings, and for advertising cookies (your consent).</li>
        <li>To meet legal duties, for example answering lawful requests from authorities (legal obligation).</li>
      </ul>

      <h2>4. Who can see your information</h2>
      <ul>
        <li>
          <strong>Published teacher profiles</strong> are visible to signed-in principals and directors, including your phone number, email and CV. Every CV view and download is
          recorded, and you can see who viewed it. Your street address and exact map pin are never shown to them: only your state, LGA and distance.
        </li>
        <li>Teacher profiles are not public web pages and are hidden from search engines.</li>
        <li>
          <strong>Vacancies</strong> are public. A vacancy posted anonymously hides the school&apos;s name and address until the school shortlists or invites a teacher.
        </li>
        <li>
          <strong>The community feed</strong> is visible only to signed-in members. <strong>Blog posts and their comments</strong> are public once an admin approves the post.
        </li>
        <li>Our admins can see what they need to moderate reports and keep the platform safe. Their actions are logged.</li>
      </ul>

      <h2>5. Service providers</h2>
      <p>We use trusted providers who process data only on our instructions:</p>
      <ul>
        <li>Backblaze B2 for storing files such as CVs and photos (files are virus-scanned and opened only through links that expire after 10 minutes);</li>
        <li>an email provider and an SMS provider to send messages you asked for;</li>
        <li>Google, for advertising and for the cookie consent message (section 6), and for maps and address lookup;</li>
        <li>our hosting and database providers.</li>
      </ul>
      <p>Some providers keep data outside Nigeria. Where that happens we rely on the safeguards the NDPA allows, such as contracts that protect your data.</p>

      <h2>6. Cookies and advertising</h2>
      <p>
        We use a small number of essential cookies to keep you signed in and secure. {APP_NAME} is free because public pages (jobs and the blog) show adverts from Google AdSense.
        Google and its partners use cookies to show and measure adverts, and with your consent, to personalise them based on your visits to this and other websites.
      </p>
      <p>
        Before any advertising cookie is set, Google&apos;s consent message asks for your choice. You can change it at any time from the privacy link it shows. Learn how Google uses
        data at{' '}
        <a href="https://policies.google.com/technologies/partner-sites" rel="noopener noreferrer">
          policies.google.com/technologies/partner-sites
        </a>{' '}
        and manage personalised ads at{' '}
        <a href="https://adssettings.google.com" rel="noopener noreferrer">
          adssettings.google.com
        </a>
        . Adverts never appear on sign-in pages, dashboards, chat, applications or admin pages.
      </p>

      <h2>7. How long we keep it</h2>
      <ul>
        <li>Your account data is kept while your account is open.</li>
        <li>When you replace your CV, older versions are deleted after 90 days. A copy of the CV sent with an application stays with that application.</li>
        <li>
          When you delete your account it is hidden at once and erased 30 days later: contact details, profile, CVs, files and posts. Applications and chats stay for the other side
          but show &quot;Deleted teacher&quot; or &quot;Deleted user&quot;.
        </li>
        <li>Security and moderation records are kept as long as needed to protect the platform and meet legal duties.</li>
      </ul>

      <h2>8. Your rights</h2>
      <p>Under the NDPA you can:</p>
      <ul>
        <li>
          get a copy of your data: <strong>Account → Download my data</strong>;
        </li>
        <li>correct your data by editing your profile;</li>
        <li>
          delete your account: <strong>Account → Delete my account</strong>;
        </li>
        <li>withdraw consent (notification settings, Google&apos;s consent message) and object to some uses;</li>
        <li>
          complain to the Nigeria Data Protection Commission (NDPC) if you think we have not handled your data properly. Please contact us first so we can help.
        </li>
      </ul>

      <h2>9. Security</h2>
      <p>
        Connections are encrypted, passwords are hashed, uploads are virus-scanned and files open only through short-lived links. No system is perfectly secure: if a breach
        affects you, we will tell you and the NDPC as the law requires.
      </p>

      <h2>10. Age</h2>
      <p>{APP_NAME} is for adults aged 18 and over. We do not knowingly collect data from children.</p>

      <h2>11. Changes</h2>
      <p>We will update this page when our practices change and show the date at the top. For important changes we will also tell you by email or in the app.</p>
    </StaticPage>
  );
}
