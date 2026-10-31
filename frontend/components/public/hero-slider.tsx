'use client';

import Image, { type StaticImageData } from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import teacher from '@/public/images/stock/teacher.jpg';
import principal from '@/public/images/stock/principal.jpg';
import director from '@/public/images/stock/director.jpg';

type Slide = { image: StaticImageData; position: string; role: string; line: string; cta: string };

const SLIDES: Slide[] = [
  { image: teacher, position: 'object-[20%_40%]', role: 'Teachers', line: 'Find teaching jobs near you and apply free with your CV.', cta: 'Join as a teacher' },
  { image: principal, position: 'object-[30%_30%]', role: 'Principals', line: 'Post vacancies, read CVs and chat with qualified teachers.', cta: 'Join as a principal' },
  { image: director, position: 'object-[50%_25%]', role: 'Directors', line: 'Hire for your school, named or anonymous, in any state.', cta: 'Join as a director' },
];

const INTERVAL_MS = 5000;

/**
 * Home page slideshow: teacher, principal, director. Slides cross-fade (opacity only, so no
 * layout shift); it pauses while hovered, touched or focused, and stays put for people who
 * ask for reduced motion. The first image is the LCP element, so it loads with priority.
 */
export function HeroSlider() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % SLIDES.length), INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [paused]);

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Who EDU-FORUM is for"
      className="relative h-72 overflow-hidden rounded-md border border-slate-200 sm:h-96"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      {SLIDES.map((s, i) => (
        <div
          key={s.role}
          role="group"
          aria-roledescription="slide"
          aria-label={`${i + 1} of ${SLIDES.length}: ${s.role}`}
          aria-hidden={i !== index}
          className={`absolute inset-0 transition-opacity duration-1000 ${i === index ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        >
          <Image
            src={s.image}
            alt={`${s.role} on EDU-FORUM`}
            fill
            priority={i === 0}
            sizes="(min-width: 1200px) 1150px, 100vw"
            placeholder="blur"
            className={`object-cover ${s.position} ${i === index ? 'scale-105' : 'scale-100'} transition-transform duration-[6000ms] ease-out`}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent sm:bg-gradient-to-r sm:from-black/80 sm:via-black/40" />
          <div className="absolute inset-x-0 bottom-0 space-y-2 p-5 sm:inset-y-0 sm:right-auto sm:flex sm:max-w-md sm:flex-col sm:justify-center sm:p-10">
            <p className="font-heading text-3xl uppercase tracking-[0.06em] text-gold sm:text-5xl">{s.role}</p>
            <p className="text-base text-slate-900 sm:text-lg">{s.line}</p>
            <Link
              href="/register"
              tabIndex={i === index ? 0 : -1}
              className="press mt-2 inline-block w-fit rounded-sm bg-emerald-700 px-4 py-2 font-heading text-sm uppercase tracking-[0.12em] text-white hover:bg-emerald-600"
            >
              {s.cta}
            </Link>
          </div>
        </div>
      ))}
      <div className="absolute bottom-3 right-4 flex gap-1">
        {SLIDES.map((s, i) => (
          <button
            key={s.role}
            type="button"
            aria-label={`Show slide ${i + 1}: ${s.role}`}
            aria-current={i === index}
            onClick={() => setIndex(i)}
            className="flex h-8 w-8 items-center justify-center"
          >
            <span className={`block h-2.5 rounded-full transition-all ${i === index ? 'w-6 bg-gold' : 'w-2.5 bg-white/60'}`} />
          </button>
        ))}
      </div>
    </section>
  );
}
