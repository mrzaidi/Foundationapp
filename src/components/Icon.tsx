import type { SVGProps } from 'react';

const P: Record<string, React.ReactNode> = {
  /* funds */
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M3 10h18M8 3v4M16 3v4" />
      <path d="M8 15h3" />
    </>
  ),
  health: (
    <>
      <path d="M12 20.5s-7.5-4.6-7.5-10A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 7.5 3.5c0 5.4-7.5 10-7.5 10Z" />
      <path d="M8.5 12h2l1-2 1.5 4 1-2h2" />
    </>
  ),
  basket: (
    <>
      <path d="M4 9h16l-1.4 9.2a2 2 0 0 1-2 1.8H7.4a2 2 0 0 1-2-1.8L4 9Z" />
      <path d="M9 9 12 3l3 6" />
      <path d="M10 13v3M14 13v3" />
    </>
  ),
  bolt: <path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12L13 2Z" />,
  book: (
    <>
      <path d="M4 4.5h6a2.5 2.5 0 0 1 2 1 2.5 2.5 0 0 1 2-1h6v13h-6a2.5 2.5 0 0 0-2 1 2.5 2.5 0 0 0-2-1H4Z" />
      <path d="M12 5.5v13" />
    </>
  ),
  budget: (
    <>
      <path d="M12 3v18" />
      <path d="M16.5 7.2c-.7-1.3-2.4-2.2-4.5-2.2-2.6 0-4.4 1.2-4.4 3s1.6 2.6 4.4 3.2c3 .7 4.7 1.5 4.7 3.4 0 2-2 3.4-4.7 3.4-2.3 0-4.1-.9-4.8-2.3" />
    </>
  ),
  heart: (
    <path d="M12 20.5s-7.5-4.6-7.5-10A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 7.5 3.5c0 5.4-7.5 10-7.5 10Z" />
  ),

  /* nav */
  home: (
    <>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5.5 9.5V20h13V9.5" />
      <path d="M9.5 20v-5.5h5V20" />
    </>
  ),
  list: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
      <path d="M8 9h8M8 13h8M8 17h4" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="3.8" />
      <path d="M4.5 20c0-3.6 3.4-6 7.5-6s7.5 2.4 7.5 6" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.4" />
      <path d="M2.8 20c0-3.3 2.9-5.6 6.2-5.6s6.2 2.3 6.2 5.6" />
      <path d="M16.5 5.2a3.4 3.4 0 0 1 0 6.6M17.5 14.8c2.3.6 3.9 2.3 3.9 5.2" />
    </>
  ),
  grid: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="2.2" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="2.2" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="2.2" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="2.2" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  bell: (
    <>
      <path d="M18 9a6 6 0 1 0-12 0c0 4.5-2 6-2 6h16s-2-1.5-2-6Z" />
      <path d="M10.3 19a2 2 0 0 0 3.4 0" />
    </>
  ),

  /* actions */
  chevronRight: <path d="M9 5l7 7-7 7" />,
  chevronLeft: <path d="M15 5l-7 7 7 7" />,
  chevronDown: <path d="M6 9l6 6 6-6" />,
  arrowRight: (
    <>
      <path d="M5 12h14" />
      <path d="M13 6l6 6-6 6" />
    </>
  ),
  check: <path d="M4.5 12.5 9.5 17.5 19.5 7" />,
  checkCircle: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.4l2.8 2.8L16 9.8" />
    </>
  ),
  x: <path d="M6 6l12 12M18 6L6 18" />,
  xCircle: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9 9l6 6M15 9l-6 6" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5.3l3.2 2" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </>
  ),
  filter: <path d="M3.5 5.5h17l-6.6 7.6V20l-3.8-2.2v-4.7L3.5 5.5Z" />,
  upload: (
    <>
      <path d="M12 16V4" />
      <path d="M7.5 8.5 12 4l4.5 4.5" />
      <path d="M4 15v3.5A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5V15" />
    </>
  ),
  camera: (
    <>
      <path d="M3.5 8.5h3l1.6-2.4h7.8l1.6 2.4h3v10a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5v-10Z" />
      <circle cx="12" cy="13.5" r="3.4" />
    </>
  ),
  file: (
    <>
      <path d="M13.5 3.5H7A2 2 0 0 0 5 5.5v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9l-5.5-5.5Z" />
      <path d="M13.5 3.5V9H19" />
    </>
  ),
  image: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
      <circle cx="9" cy="10" r="1.8" />
      <path d="m4.5 17 4.2-4 3.3 3 2.8-2.6 4.7 4.4" />
    </>
  ),
  download: (
    <>
      <path d="M12 4v12" />
      <path d="M7.5 11.5 12 16l4.5-4.5" />
      <path d="M4 18.5h16" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3.2" />
    </>
  ),
  eyeOff: (
    <>
      <path d="M10.6 6.7A8.8 8.8 0 0 1 12 6.5c6 0 9.5 6 9.5 6a17 17 0 0 1-3 3.6M6.3 7.8A16.8 16.8 0 0 0 2.5 12.5s3.5 6 9.5 6a8.9 8.9 0 0 0 3.5-.7" />
      <path d="M9.9 10.2a3.2 3.2 0 0 0 4.3 4.5" />
      <path d="M3.5 3.5l17 17" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="m4 7.5 8 5 8-5" />
    </>
  ),
  phone: (
    <path d="M6 3.5h3l1.6 4-2 1.4a12 12 0 0 0 5.5 5.5l1.4-2 4 1.6v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4 5.7 2 2 0 0 1 6 3.5Z" />
  ),
  lock: (
    <>
      <rect x="4.5" y="10" width="15" height="10.5" rx="3" />
      <path d="M8 10V7.5a4 4 0 0 1 8 0V10" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s7-5.8 7-11a7 7 0 1 0-14 0c0 5.2 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.8" />
    </>
  ),
  idcard: (
    <>
      <rect x="2.5" y="5" width="19" height="14" rx="3" />
      <circle cx="8.5" cy="11" r="2.2" />
      <path d="M5 16.2c.6-1.5 2-2.2 3.5-2.2s2.9.7 3.5 2.2" />
      <path d="M14.5 10h4M14.5 13.5h4" />
    </>
  ),
  wallet: (
    <>
      <rect x="3" y="6" width="18" height="13" rx="3" />
      <path d="M3 10h18" />
      <circle cx="17" cy="14.5" r="1.3" />
    </>
  ),
  send: <path d="M21 3 10.5 13.5M21 3l-6.8 18-3.7-7.5L3 9.8 21 3Z" />,
  trend: (
    <>
      <path d="M3.5 16.5 9 11l3.5 3.5L20 7" />
      <path d="M15.5 7H20v4.5" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 5 6v5.5c0 4.4 3 8 7 9.5 4-1.5 7-5.1 7-9.5V6l-7-3Z" />
      <path d="M9.2 12.2 11.2 14.2 15 10.4" />
    </>
  ),
  logout: (
    <>
      <path d="M9.5 4.5H6A2 2 0 0 0 4 6.5v11a2 2 0 0 0 2 2h3.5" />
      <path d="M15 8l4 4-4 4" />
      <path d="M19 12H9.5" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 13.5a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V20a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.11-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H4a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.56-1.11 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H10a1.7 1.7 0 0 0 1-1.56V4a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V10a1.7 1.7 0 0 0 1.56 1H20a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1.03Z" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 7.8v.6" />
    </>
  ),
  alert: (
    <>
      <path d="M12 4 2.8 20h18.4L12 4Z" />
      <path d="M12 10v4M12 17.2v.4" />
    </>
  ),
  inbox: (
    <>
      <path d="M3.5 13.5 6 5.5h12l2.5 8v5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-5Z" />
      <path d="M3.5 13.5h4l1 2.5h7l1-2.5h4" />
    </>
  ),
  refresh: (
    <>
      <path d="M4 12a8 8 0 0 1 13.7-5.6L20 8.5" />
      <path d="M20 4v4.5h-4.5" />
      <path d="M20 12a8 8 0 0 1-13.7 5.6L4 15.5" />
      <path d="M4 20v-4.5h4.5" />
    </>
  ),
  gender: (
    <>
      <circle cx="10" cy="14" r="5" />
      <path d="M13.8 10.2 20 4M15 4h5v5" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3.2 10h17.6M3.2 14h17.6" />
      <path d="M12 3c2.4 2.6 3.6 5.6 3.6 9s-1.2 6.4-3.6 9c-2.4-2.6-3.6-5.6-3.6-9S9.6 5.6 12 3Z" />
    </>
  ),
  building: (
    <>
      <rect x="4" y="3.5" width="16" height="17" rx="2.5" />
      <path d="M8 8h2M14 8h2M8 12h2M14 12h2M10 20.5v-4h4v4" />
    </>
  ),
};

export type IconName = keyof typeof P;

interface Props extends SVGProps<SVGSVGElement> {
  name: string;
  strokeWidth?: number;
}

export default function Icon({ name, strokeWidth = 1.9, ...rest }: Props) {
  const path = P[name] ?? P.info;
  return (
    <svg
      viewBox="0 0 24 24"
      // presentation attributes — any CSS rule still wins, but an icon with no
      // rule at all gets a sane size instead of filling its parent
      width={20}
      height={20}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {path}
    </svg>
  );
}
