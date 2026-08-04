/**
 * The two pattern systems from the ALTA brand book:
 *  - "dashes"  — scattered rounded bars (the confetti/sprinkle pattern)
 *  - "pipes"   — connected stepped lines with rounded joints
 *
 * Both come in light / medium / heavy densities. `patternId` must be unique
 * per instance on the page (SVG pattern ids are global).
 */

type Variant = "dashes" | "pipes";
type Density = "light" | "medium" | "heavy";
type Tone = "on-dark" | "on-light";

const TONES: Record<Tone, { base: string; accents: string[]; opacity: number }> =
  {
    "on-dark": {
      base: "#7b3fa3",
      accents: ["#eb1c24", "#f5911e", "#ef5a28", "#ae236b"],
      opacity: 1,
    },
    "on-light": {
      base: "#652d8f",
      accents: ["#eb1c24", "#f5911e", "#ef5a28", "#ae236b"],
      opacity: 0.9,
    },
  };

/** x, y, length, rotation, colour index (-1 = base purple) */
const DASHES: [number, number, number, number, number][] = [
  [14, 22, 40, 0, -1],
  [96, 10, 26, -55, 1],
  [156, 34, 44, 0, -1],
  [40, 62, 24, -55, 0],
  [118, 74, 46, 0, -1],
  [186, 66, 26, -55, 2],
  [18, 108, 46, 0, -1],
  [92, 120, 26, -55, 3],
  [150, 112, 40, 0, -1],
  [58, 156, 26, -55, 1],
  [116, 168, 44, 0, -1],
  [184, 150, 40, 0, -1],
  [22, 186, 26, -55, 2],
  [140, 200, 26, -55, 0],
];

/** stepped runs: [startX, startY, run1, rise, run2, colour index] */
const PIPES: [number, number, number, number, number, number][] = [
  [-20, 36, 70, -28, 90, -1],
  [110, 108, 60, -28, 100, -1],
  [-40, 176, 84, -28, 76, -1],
  [150, 214, 70, -28, 80, -1],
];

const PIPE_ACCENTS: [number, number, number, number][] = [
  [16, 84, 44, 1],
  [180, 152, 40, 0],
  [70, 244, 38, 2],
];

export default function BrandPattern({
  patternId,
  variant = "dashes",
  density = "medium",
  tone = "on-dark",
  className = "",
}: {
  patternId: string;
  variant?: Variant;
  density?: Density;
  tone?: Tone;
  className?: string;
}) {
  const { base, accents, opacity } = TONES[tone];
  const tile = 260;

  const keep =
    density === "light" ? 0.45 : density === "medium" ? 0.72 : 1;

  const colourOf = (i: number) => (i < 0 ? base : accents[i % accents.length]);

  return (
    <svg
      aria-hidden
      className={className}
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <pattern
          id={patternId}
          width={tile}
          height={tile}
          patternUnits="userSpaceOnUse"
        >
          {variant === "dashes"
            ? DASHES.slice(0, Math.ceil(DASHES.length * keep)).map(
                ([x, y, len, rot, ci], i) => (
                  <rect
                    key={i}
                    x={x}
                    y={y}
                    width={len}
                    height={13}
                    rx={6.5}
                    fill={colourOf(ci)}
                    opacity={opacity}
                    transform={`rotate(${rot} ${x + len / 2} ${y + 6.5})`}
                  />
                ),
              )
            : (
                <>
                  {PIPES.slice(0, Math.ceil(PIPES.length * keep)).map(
                    ([x, y, r1, rise, r2, ci], i) => (
                      <path
                        key={`p${i}`}
                        d={`M${x} ${y} h${r1} l${Math.abs(rise)} ${rise} h${r2}`}
                        fill="none"
                        stroke={colourOf(ci)}
                        strokeWidth={17}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        opacity={opacity}
                      />
                    ),
                  )}
                  {density !== "light" &&
                    PIPE_ACCENTS.map(([x, y, len, ci], i) => (
                      <rect
                        key={`a${i}`}
                        x={x}
                        y={y}
                        width={len}
                        height={17}
                        rx={8.5}
                        fill={colourOf(ci)}
                      />
                    ))}
                </>
              )}
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${patternId})`} />
    </svg>
  );
}
