/**
 * The rounded-tile icon set from the brand book. Each glyph is white on a
 * brand-coloured tile that carries the signature asymmetric corners.
 */

export type IconName =
  | "discount" // ფასდაკლება / აქცია
  | "home" // ტექნიკა სახლისთვის
  | "star" // შეთავაზება / ახალი
  | "gift" // საჩუქარი
  | "cart" // ონლაინ ყიდვა
  | "warranty" // გარანტია
  | "delivery"; // მიწოდება

const TILE: Record<IconName, string> = {
  discount: "bg-alta-crimson",
  home: "bg-alta-orange",
  star: "bg-alta-flame",
  gift: "bg-alta-magenta",
  cart: "bg-alta-purple",
  warranty: "bg-alta-teal",
  delivery: "bg-alta-pink",
};

const GLYPH: Record<IconName, React.ReactNode> = {
  discount: (
    <>
      <circle cx="7.5" cy="7.5" r="2.9" />
      <circle cx="16.5" cy="16.5" r="2.9" />
      <rect
        x="10.7"
        y="2.2"
        width="2.6"
        height="19.6"
        rx="1.3"
        transform="rotate(24 12 12)"
      />
    </>
  ),
  home: <path d="M12 4.4 3.6 11.2A1 1 0 0 0 4.24 13H19.76a1 1 0 0 0 .64-1.77Z" />,
  star: (
    <path d="m12 2.4 2.35 5.4 5.35-2.5-2.5 5.35 5.4 2.35-5.4 2.35 2.5 5.35-5.35-2.5L12 21.6l-2.35-5.4-5.35 2.5 2.5-5.35L1.4 13l5.4-2.35-2.5-5.35 5.35 2.5Z" />
  ),
  gift: (
    <>
      <rect x="3.2" y="10.6" width="17.6" height="10.2" rx="1.6" />
      <rect x="10.6" y="9" width="2.8" height="12" />
      <path d="M11.4 8.6H7.2a2.6 2.6 0 1 1 2.2-4.1ZM12.6 8.6h4.2a2.6 2.6 0 1 0-2.2-4.1Z" />
    </>
  ),
  cart: (
    <>
      <path d="M2.6 4.2h2.9a1 1 0 0 1 .97.76l2.4 9.6a1 1 0 0 0 .97.76h9.3v-2.4H10.4l-.4-1.6h9.8L21.4 5H7.1l-.4-1.6a1 1 0 0 0-.97-.76H2.6Z" />
      <circle cx="10" cy="19.4" r="2" />
      <circle cx="18" cy="19.4" r="2" />
    </>
  ),
  warranty: (
    <path d="M12 2.2a2.4 2.4 0 0 1 1.9.9 2.4 2.4 0 0 0 2.3.85 2.4 2.4 0 0 1 2.9 2.9 2.4 2.4 0 0 0 .85 2.3 2.4 2.4 0 0 1 0 3.8 2.4 2.4 0 0 0-.85 2.3 2.4 2.4 0 0 1-2.9 2.9 2.4 2.4 0 0 0-2.3.85 2.4 2.4 0 0 1-3.8 0 2.4 2.4 0 0 0-2.3-.85 2.4 2.4 0 0 1-2.9-2.9 2.4 2.4 0 0 0-.85-2.3 2.4 2.4 0 0 1 0-3.8 2.4 2.4 0 0 0 .85-2.3 2.4 2.4 0 0 1 2.9-2.9 2.4 2.4 0 0 0 2.3-.85A2.4 2.4 0 0 1 12 2.2Z" />
  ),
  delivery: (
    <>
      <path d="M2.4 6.6h10.2a1 1 0 0 1 1 1v7.8H2.4Z" />
      <path d="M14.6 9.6h3.3a1 1 0 0 1 .84.46l2.3 3.6a1 1 0 0 1 .16.54v1.2h-6.6Z" />
      <circle cx="7" cy="17.6" r="2.1" />
      <circle cx="17.4" cy="17.6" r="2.1" />
    </>
  ),
};

const SIZES = {
  sm: "size-7",
  md: "size-9",
  lg: "size-12",
} as const;

export default function AltaIcon({
  name,
  size = "md",
  className = "",
  title,
}: {
  name: IconName;
  size?: keyof typeof SIZES;
  className?: string;
  title?: string;
}) {
  return (
    <span
      className={`alta-corners inline-grid shrink-0 place-items-center ${TILE[name]} ${SIZES[size]} ${className}`}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <svg viewBox="0 0 24 24" fill="#ffffff" className="size-[62%]">
        {GLYPH[name]}
      </svg>
    </span>
  );
}
