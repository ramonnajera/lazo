import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;

/** Íconos de la isla: 24 × 24, trazo 1.8, `currentColor` (trazos de las maquetas 2026-10-26). */
function Svg({ children, ...p }: P) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...p}>
      {children}
    </svg>
  );
}

// Barra: trazos del estilo de lazo-watch (maqueta "Isla Lazo estilo app", 2026-10-28)
export const IconTodo = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M8.5 12.3l2.4 2.4 4.6-4.9" />
  </Svg>
);
export const IconGift = (p: P) => (
  <Svg {...p}>
    <rect x="4" y="10.5" width="16" height="9.5" rx="2" />
    <rect x="3" y="7" width="18" height="3.5" rx="1.2" />
    <path d="M12 7v13M12 7c-1.4-3.2-5-3.2-5-1.2 0 1.4 3 1.2 5 1.2zM12 7c1.4-3.2 5-3.2 5-1.2 0 1.4-3 1.2-5 1.2z" />
  </Svg>
);
export const IconGear = (p: P) => (
  <Svg {...p}>
    {/* Escalado 1.14: con los dientes, el engrane se ve más chico que los círculos de los demás íconos. */}
    <g transform="translate(12 12) scale(1.14) translate(-12 -12)">
    <circle cx="12" cy="12" r="3" />
    <path d="M10.3 3.6h3.4l.5 2.1c.5.2.9.4 1.3.7l2-.7 1.7 3-1.5 1.5c.1.5.1 1 0 1.6l1.5 1.5-1.7 3-2-.7c-.4.3-.8.5-1.3.7l-.5 2.1h-3.4l-.5-2.1c-.5-.2-.9-.4-1.3-.7l-2 .7-1.7-3 1.5-1.5c-.1-.5-.1-1 0-1.6L4.8 8.7l1.7-3 2 .7c.4-.3.8-.5 1.3-.7z" />
    </g>
  </Svg>
);
export const IconCalendar = (p: P) => (
  <Svg {...p}>
    <rect x="3.5" y="5" width="17" height="15" rx="3" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </Svg>
);
export const IconMoney = (p: P) => (
  <Svg {...p}>
    <rect x="3" y="6" width="18" height="12" rx="3" />
    <circle cx="12" cy="12" r="2.5" />
  </Svg>
);
export const IconList = (p: P) => (
  <Svg {...p}>
    <rect x="4" y="3.5" width="12" height="15" rx="2" />
    <path d="M8 3.5v6.5l2-1.5 2 1.5V3.5" />
    <path d="M19.5 7v11.5a2.5 2.5 0 0 1-2.5 2.5H7.5" />
  </Svg>
);
export const IconChat = (p: P) => (
  <Svg {...p}>
    <path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.1A8 8 0 1 1 20 12z" />
  </Svg>
);
export const IconMic = (p: P) => (
  <Svg {...p}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
  </Svg>
);
export const IconSend = (p: P) => (
  <Svg {...p}>
    <path d="M12 19V5M6 11l6-6 6 6" />
  </Svg>
);
export const IconPlus = (p: P) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);
export const IconChevronLeft = (p: P) => (
  <Svg {...p}>
    <path d="M15 18l-6-6 6-6" />
  </Svg>
);

/** Controles de música: rellenos, como en la maqueta 06. */
function Filled({ children, ...p }: P) {
  return (
    <Svg fill="currentColor" stroke="none" {...p}>
      {children}
    </Svg>
  );
}
export const IconPlay = (p: P) => (
  <Filled {...p}>
    <path d="M8 5v14l11-7z" />
  </Filled>
);
export const IconPause = (p: P) => (
  <Filled {...p}>
    <path d="M7 5h4v14H7zM13 5h4v14h-4z" />
  </Filled>
);
export const IconPrev = (p: P) => (
  <Filled {...p}>
    <path d="M6 6h2v12H6zM9.5 12 18 6v12z" />
  </Filled>
);
export const IconNext = (p: P) => (
  <Filled {...p}>
    <path d="M16 6h2v12h-2zM6 18V6l8.5 6z" />
  </Filled>
);

// Categorías de Listas (en vez de emojis). Colección usa el ícono de su categoría del Back Log.
const CATEGORY_PATHS: Record<string, string[]> = {
  videogames: ["M7 8h10a4 4 0 0 1 4 4v1a3 3 0 0 1-5.4 1.8L15 14H9l-.6.8A3 3 0 0 1 3 13v-1a4 4 0 0 1 4-4z", "M8 11v2M7 12h2"],
  movies: ["M3.5 7.5a2.5 2.5 0 0 1 2.5-2.5h12a2.5 2.5 0 0 1 2.5 2.5v9a2.5 2.5 0 0 1-2.5 2.5H6a2.5 2.5 0 0 1-2.5-2.5z", "M3.5 9.5h17M8 5l2 4.5M13 5l2 4.5"],
  series: ["M3 8.5A2.5 2.5 0 0 1 5.5 6h13A2.5 2.5 0 0 1 21 8.5v7a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 15.5z", "M9 21h6"],
  anime: ["M12 3l2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2z"],
  "anime-movies": ["M3.5 7.5a2.5 2.5 0 0 1 2.5-2.5h12a2.5 2.5 0 0 1 2.5 2.5v9a2.5 2.5 0 0 1-2.5 2.5H6a2.5 2.5 0 0 1-2.5-2.5z", "M3.5 9.5h17M9 14h6"],
  manga: ["M5 5.5A2 2 0 0 1 7 4h5v16H7a2 2 0 0 1-2-2zM12 4h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5"],
  books: ["M5 4h4v16H5zM10 4h4v16h-4zM15.5 5.5l3.4-.9 3 14.6-3.4.9z"],
  wishlist: ["M5 8h14l-1 12H6z", "M9 8V6a3 3 0 0 1 6 0v2"],
  consoles: ["M8 7h8a5 5 0 0 1 0 10H8A5 5 0 0 1 8 7z", "M8 11v2M7 12h2M15.5 12h.01"],
  other: ["M4 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"],
};

export function CategoryIcon({ category, ...p }: P & { category: string }) {
  const key = category.replace(/^col-/, "");
  return <Svg {...p}>{(CATEGORY_PATHS[key] ?? CATEGORY_PATHS.other).map((d) => <path key={d} d={d} />)}</Svg>;
}

export const IconPulse = (p: P) => (
  <Svg {...p}>
    <path d="M3 12.5h4l2.2-6 4.2 12 2.4-6H21" />
  </Svg>
);
