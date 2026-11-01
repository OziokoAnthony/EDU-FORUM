import Script from 'next/script';
import { ADSENSE_CLIENT } from '@/lib/ads';

/**
 * Loaded once, in the public layout only (CLAUDE.md). Google's Privacy & Messaging consent tool
 * runs first for every visitor (user, 2026-11-01), then the AdSense script; AdSense waits for the
 * visitor's choice before personalised ads. Nothing loads until NEXT_PUBLIC_ADSENSE_CLIENT is set.
 */
export function AdScripts() {
  if (!ADSENSE_CLIENT) return null;
  const pub = ADSENSE_CLIENT.replace(/^ca-/, '');
  return (
    <>
      <Script id="google-consent" src={`https://fundingchoicesmessages.google.com/i/${pub}?ers=1`} strategy="afterInteractive" />
      <Script id="google-consent-signal" strategy="afterInteractive">
        {`(function(){function s(){if(!window.frames['googlefcPresent']){if(document.body){var i=document.createElement('iframe');i.style='width:0;height:0;border:none;z-index:-1000;left:-1000px;top:-1000px;';i.style.display='none';i.name='googlefcPresent';document.body.appendChild(i);}else{setTimeout(s,0);}}}s();})();`}
      </Script>
      <Script id="adsbygoogle" src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`} strategy="lazyOnload" crossOrigin="anonymous" />
    </>
  );
}
