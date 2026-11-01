'use client';

import { useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

/** The AdSense unit itself, created only once the space is about to scroll into view. */
export function AdUnit({ client, slotId, height }: { client: string; slotId: string; height: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const pushed = useRef(false);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setNear(true), { rootMargin: '300px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!near || pushed.current) return;
    pushed.current = true;
    try {
      (window.adsbygoogle = window.adsbygoogle ?? []).push({});
    } catch {
      // Blocked by an ad blocker or not ready: the reserved space simply stays empty.
    }
  }, [near]);

  return (
    <div ref={box} style={{ minHeight: height }}>
      {near ? (
        <ins
          className="adsbygoogle"
          style={{ display: 'block', minHeight: height }}
          data-ad-client={client}
          data-ad-slot={slotId}
          data-ad-format="auto"
          data-full-width-responsive="true"
        />
      ) : null}
    </div>
  );
}
