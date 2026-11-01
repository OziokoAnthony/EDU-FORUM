import Image, { type StaticImageData } from 'next/image';
import teacher from '@/public/images/stock/teacher.jpg';
import teacher2 from '@/public/images/stock/teacher-2.jpg';
import principal from '@/public/images/stock/principal.jpg';
import director from '@/public/images/stock/director.jpg';
import school from '@/public/images/stock/school.jpg';
import cv from '@/public/images/stock/cv.jpg';

type Tile = { image: StaticImageData; label: string; position: string; span: string };

const TILES: Tile[] = [
  { image: teacher, label: 'Teacher', position: 'object-[15%_40%]', span: 'col-span-2 row-span-2' },
  { image: principal, label: 'Principal', position: 'object-[30%_30%]', span: '' },
  { image: director, label: 'Director', position: 'object-[50%_20%]', span: '' },
  { image: school, label: 'School', position: 'object-[60%_70%]', span: '' },
  { image: cv, label: 'Your CV', position: 'object-[25%_50%]', span: '' },
  { image: teacher2, label: 'Teacher', position: 'object-[50%_25%]', span: '' },
];

/** Side panel on sign-in and sign-up (laptops): the people, the school and the CV. */
export function PhotoCollage() {
  return (
    <div aria-hidden className="stagger grid h-full min-h-[22rem] grid-cols-3 grid-rows-3 gap-2">
      {TILES.map((t, i) => (
        <figure key={i} className={`group relative overflow-hidden rounded-md border border-slate-200 ${t.span}`}>
          <Image src={t.image} alt="" fill sizes="(min-width: 1024px) 25vw, 0px" placeholder="blur" className={`object-cover ${t.position} transition-transform duration-700 group-hover:scale-105`} />
          <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-3 pb-2 pt-6 text-sm font-semibold text-white">
            {t.label}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

/** The phone version: a row of small round photos above the form. */
export function PhotoStrip() {
  return (
    <div aria-hidden className="stagger flex justify-center gap-2 lg:hidden">
      {TILES.slice(0, 5).map((t, i) => (
        <div key={i} className="relative h-12 w-12 overflow-hidden rounded-full border-2 border-white shadow">
          <Image src={t.image} alt="" fill sizes="48px" className={`object-cover ${t.position}`} />
        </div>
      ))}
    </div>
  );
}
