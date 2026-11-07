/* Hand-drawn 20px line icons — 1.5 stroke, square-ish terminals, drafting feel. */
import type { SVGProps } from 'react';

const P: Record<string, JSX.Element> = {
  home: <><path d="M3.5 9 10 3.5 16.5 9" /><path d="M5 8v8.5h10V8" /><path d="M8.5 16.5v-5h3v5" /></>,
  plus: <><path d="M10 4v12M4 10h12" /></>,
  file: <><path d="M5 2.5h6.5L15 6v11.5H5z" /><path d="M11.5 2.5V6H15" /><path d="M7.5 10h5M7.5 13h3.5" /></>,
  inbox: <><path d="M3 11.5 5.2 4h9.6l2.2 7.5" /><path d="M3 11.5V16h14v-4.5h-4.2l-.8 2h-4l-.8-2z" /></>,
  list: <><path d="M7.5 5.5H17M7.5 10H17M7.5 14.5H17" /><path d="M3 5.5h1.5M3 10h1.5M3 14.5h1.5" /></>,
  alert: <><path d="M10 3 2.8 16h14.4z" /><path d="M10 8v3.6M10 13.6v.4" /></>,
  spark: <><path d="M10 2.5v4M10 13.5v4M2.5 10h4M13.5 10h4" /><path d="m5 5 2 2M13 13l2 2M15 5l-2 2M7 13l-2 2" /></>,
  users: <><circle cx="7.5" cy="7" r="2.8" /><path d="M2.5 16.5c.5-3 2.4-4.5 5-4.5s4.5 1.5 5 4.5" /><path d="M13 4.6a2.6 2.6 0 0 1 0 5M14.5 12.2c1.6.5 2.6 1.9 3 4.3" /></>,
  mail: <><rect x="2.5" y="4" width="15" height="12" rx="1" /><path d="m3 5 7 5.5L17 5" /></>,
  landmark: <><path d="M2.5 7 10 3l7.5 4H2.5z" /><path d="M4 8v7M8 8v7M12 8v7M16 8v7M2.5 17h15" /></>,
  building: <><path d="M3.5 17V5.5L10 3l6.5 2.5V17" /><path d="M2 17h16" /><path d="M7 8v6M10 8v6M13 8v6" /></>,
  settings: <><path d="M3 6h9M15 6h2M3 14h2M8 14h9" /><circle cx="13.5" cy="6" r="1.8" /><circle cx="6.5" cy="14" r="1.8" /></>,
  log: <><path d="M4 3.5h12v13H4z" /><path d="M7 7h6M7 10h6M7 13h3" /></>,
  bell: <><path d="M5 13.5V9a5 5 0 0 1 10 0v4.5l1.5 1.5h-13z" /><path d="M8.3 17a1.8 1.8 0 0 0 3.4 0" /></>,
  search: <><circle cx="8.8" cy="8.8" r="5.3" /><path d="m12.8 12.8 4 4" /></>,
  sun: <><circle cx="10" cy="10" r="3.4" /><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.3 4.3l1.4 1.4M14.3 14.3l1.4 1.4M4.3 15.7l1.4-1.4M14.3 5.7l1.4-1.4" /></>,
  moon: <><path d="M15.8 12.6A6.5 6.5 0 0 1 7.4 4.2a6.5 6.5 0 1 0 8.4 8.4z" /></>,
  logout: <><path d="M8 3.5H4v13h4" /><path d="M11.5 6.5 15 10l-3.5 3.5M15 10H7.5" /></>,
  arrowRight: <><path d="M4 10h12M11.5 5.5 16 10l-4.5 4.5" /></>,
  arrowLeft: <><path d="M16 10H4M8.5 5.5 4 10l4.5 4.5" /></>,
  arrowUpRight: <><path d="M6 14 14 6M7 6h7v7" /></>,
  check: <><path d="m4 10.5 3.8 3.8L16 6" /></>,
  x: <><path d="m5 5 10 10M15 5 5 15" /></>,
  upload: <><path d="M10 13V3.5M6 7.5l4-4 4 4" /><path d="M3.5 13v3.5h13V13" /></>,
  clip: <><path d="m15.5 9.5-5.6 5.6a3.4 3.4 0 0 1-4.8-4.8l6-6a2.3 2.3 0 0 1 3.2 3.2l-6 6a1.1 1.1 0 0 1-1.6-1.6l5.4-5.4" /></>,
  pin: <><path d="M10 17.5s-5.5-5-5.5-9a5.5 5.5 0 0 1 11 0c0 4-5.5 9-5.5 9z" /><circle cx="10" cy="8.5" r="2" /></>,
  clock: <><circle cx="10" cy="10" r="7" /><path d="M10 6v4.3l2.8 1.7" /></>,
  chevronDown: <><path d="m5.5 8 4.5 4.5L14.5 8" /></>,
  chevronRight: <><path d="m8 5.5 4.5 4.5L8 14.5" /></>,
  chevronLeft: <><path d="M12 5.5 7.5 10l4.5 4.5" /></>,
  filter: <><path d="M3 4.5h14l-5.5 6.5v5l-3-1.5V11z" /></>,
  download: <><path d="M10 3.5V13M6 9l4 4 4-4" /><path d="M3.5 16.5h13" /></>,
  refresh: <><path d="M15.8 8.2A6 6 0 0 0 4.6 7M4.2 11.8A6 6 0 0 0 15.4 13" /><path d="M4.4 3.8V7h3.2M15.6 16.2V13h-3.2" /></>,
  globe: <><circle cx="10" cy="10" r="7" /><path d="M3 10h14M10 3c2 2.2 2.8 4.5 2.8 7s-.8 4.8-2.8 7c-2-2.2-2.8-4.5-2.8-7S8 5.2 10 3z" /></>,
  layers: <><path d="m10 3 7 3.8-7 3.8-7-3.8z" /><path d="m3 10.2 7 3.8 7-3.8M3 13.6l7 3.8 7-3.8" /></>,
  gauge: <><path d="M3.3 14a7 7 0 1 1 13.4 0" /><path d="m10 12 3.5-4" /><circle cx="10" cy="12" r="1" /></>,
  merge: <><path d="M5 3v4c0 3 5 3 5 6v4M15 3v4c0 3-5 3-5 6" /><path d="m7.5 14.5 2.5 2.5 2.5-2.5" /></>,
  flag: <><path d="M4.5 17.5V3" /><path d="M4.5 3.5h10l-2 3.5 2 3.5h-10" /></>,
  message: <><path d="M3 4h14v9.5H8.5L5 16.5v-3H3z" /></>,
  user: <><circle cx="10" cy="7" r="3.2" /><path d="M3.5 17c.7-3.4 3.2-5 6.5-5s5.8 1.6 6.5 5" /></>,
  shield: <><path d="M10 2.5 16 5v4.6c0 3.6-2.5 6.6-6 7.9-3.5-1.3-6-4.3-6-7.9V5z" /><path d="m7.3 10 2 2 3.6-3.8" /></>,
  eye: <><path d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10z" /><circle cx="10" cy="10" r="2.4" /></>,
  more: <><circle cx="5" cy="10" r=".9" /><circle cx="10" cy="10" r=".9" /><circle cx="15" cy="10" r=".9" /></>,
  copy: <><path d="M7 7h9.5v9.5H7z" /><path d="M13 7V3.5H3.5V13H7" /></>,
  menu: <><path d="M3 6h14M3 10h14M3 14h9" /></>,
  bolt: <><path d="M11 2.5 4.5 11.5H10L9 17.5l6.5-9H10z" /></>,
  book: <><path d="M3.5 4.5c2.5-1 4.8-1 6.5.6 1.7-1.6 4-1.6 6.5-.6v11.5c-2.5-1-4.8-1-6.5.6-1.7-1.6-4-1.6-6.5-.6z" /><path d="M10 5.1v11.5" /></>,
  route: <><circle cx="5" cy="15" r="2" /><circle cx="15" cy="5" r="2" /><path d="M7 15h5.5a2.5 2.5 0 0 0 0-5h-5a2.5 2.5 0 0 1 0-5H13" /></>,
  translate: <><path d="M2.5 4.5h8M6.5 3v1.5c0 3.5-1.8 6-4 7.2M4.2 7.5c1 2 2.6 3.4 4.6 4.2" /><path d="m10.5 17 3-7.5 3 7.5M11.6 14.5h3.8" /></>,
  scale: <><path d="M10 3v14M5 17h10M3 6h14" /><path d="m5 6-2.5 5h5zM15 6l-2.5 5h5z" /></>,
  history: <><path d="M3.5 10a6.5 6.5 0 1 0 1.9-4.6" /><path d="M3.5 3.5V7H7" /><path d="M10 6.5V10l2.5 1.6" /></>,
  target: <><circle cx="10" cy="10" r="7" /><circle cx="10" cy="10" r="3.5" /><circle cx="10" cy="10" r=".8" /></>,
  cpu: <><path d="M5.5 5.5h9v9h-9z" /><path d="M8 2.5v3M12 2.5v3M8 14.5v3M12 14.5v3M2.5 8h3M2.5 12h3M14.5 8h3M14.5 12h3" /></>,
  star: <><path d="m10 2.8 2.2 4.6 5 .6-3.7 3.5 1 5L10 14l-4.5 2.5 1-5L2.8 8l5-.6z" /></>,
  pause: <><path d="M7 4.5v11M13 4.5v11" /></>,
  play: <><path d="M6 4v12l10-6z" /></>,
  key: <><circle cx="6.5" cy="13.5" r="3" /><path d="m8.7 11.3 7.8-7.8M14 6l2 2M12 8l1.5 1.5" /></>,
  external: <><path d="M11 3.5h5.5V9M16.5 3.5l-7 7" /><path d="M14 11.5v5H3.5V6h5" /></>,
  undo: <><path d="M7 4.5 3.5 8 7 11.5" /><path d="M3.5 8H12a4.5 4.5 0 0 1 0 9H8" /></>,
  hash: <><path d="M7.5 3 6 17M14 3l-1.5 14M3.5 7.5h14M2.5 12.5h14" /></>,
  dot: <><circle cx="10" cy="10" r="3" fill="currentColor" /></>,
  plumb: <><path d="M10 2v9" /><path d="M6 2h8" /><path d="M10 11 6.5 14.5 10 18.5l3.5-4z" fill="currentColor" stroke="none" /></>,
};

export type IconName = keyof typeof P;

export function Icon({ name, size, ...rest }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 20 20"
      width={size ?? 20}
      height={size ?? 20}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {P[name]}
    </svg>
  );
}
