/**
 * Small inline line icons (no icon library, nothing to download). Decorative by default:
 * the button or link around them carries the accessible name.
 */
type P = { className?: string };
const base = (className = 'h-6 w-6') => ({
  className,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
});

export const HomeIcon = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M3 11.5 12 4l9 7.5" />
    <path d="M5 10v10h5v-6h4v6h5V10" />
  </svg>
);
export const JobsIcon = ({ className }: P) => (
  <svg {...base(className)}>
    <rect x="3" y="7" width="18" height="13" rx="2" />
    <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18" />
  </svg>
);
export const PeopleIcon = ({ className }: P) => (
  <svg {...base(className)}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
    <circle cx="17" cy="9" r="2.5" />
    <path d="M16 14.2a5 5 0 0 1 5.5 5.8" />
  </svg>
);
export const ChatIcon = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M4 5h16v11H9l-5 4z" />
  </svg>
);
export const BellIcon = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z" />
    <path d="M10 20a2 2 0 0 0 4 0" />
  </svg>
);
export const SearchIcon = ({ className }: P) => (
  <svg {...base(className)}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-4-4" />
  </svg>
);
export const MenuIcon = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M4 6h16M4 12h16M4 18h16" />
  </svg>
);
export const TeachersIcon = ({ className }: P) => (
  <svg {...base(className)}>
    <circle cx="10" cy="8" r="4" />
    <path d="M3 21a7 7 0 0 1 11.5-5.4" />
    <circle cx="18" cy="17" r="3" />
    <path d="m20.2 19.2 1.8 1.8" />
  </svg>
);
export const BookIcon = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" />
    <path d="M4 19V5M8 7h7" />
  </svg>
);
export const BookmarkIcon = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M6 3h12v18l-6-4-6 4z" />
  </svg>
);
export const CalendarIcon = ({ className }: P) => (
  <svg {...base(className)}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </svg>
);
export const MailIcon = ({ className }: P) => (
  <svg {...base(className)}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m3 7 9 6 9-6" />
  </svg>
);
export const FileIcon = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M6 3h8l4 4v14H6z" />
    <path d="M14 3v4h4M9 13h6M9 17h6" />
  </svg>
);
export const ThumbIcon = ({ className, filled }: P & { filled?: boolean }) => (
  <svg {...base(className)} fill={filled ? 'currentColor' : 'none'}>
    <path d="M7 10v10H4V10zM7 10l4-7a2 2 0 0 1 3 2l-1 4h6a2 2 0 0 1 2 2.3l-1.3 7A2 2 0 0 1 17.7 20H7" />
  </svg>
);
export const CommentIcon = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1.1-4.5A8 8 0 1 1 21 12z" />
  </svg>
);
export const ShareIcon = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M14 5l7 7-7 7v-4c-5 0-8 1.5-11 5 1-6 4-10 11-11z" />
  </svg>
);
export const PhotoIcon = ({ className }: P) => (
  <svg {...base(className)}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <circle cx="9" cy="10" r="2" />
    <path d="m21 16-5-5-9 9" />
  </svg>
);
export const CloseIcon = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);
export const ChevronIcon = ({ className, dir = 'right' }: P & { dir?: 'left' | 'right' | 'down' }) => (
  <svg {...base(className)} style={{ transform: dir === 'left' ? 'rotate(180deg)' : dir === 'down' ? 'rotate(90deg)' : undefined }}>
    <path d="m9 5 7 7-7 7" />
  </svg>
);
export const DotsIcon = ({ className }: P) => (
  <svg {...base(className)} fill="currentColor" stroke="none">
    <circle cx="5" cy="12" r="1.8" />
    <circle cx="12" cy="12" r="1.8" />
    <circle cx="19" cy="12" r="1.8" />
  </svg>
);
export const ShieldIcon = ({ className }: P) => (
  <svg {...base(className)}>
    <path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z" />
  </svg>
);
