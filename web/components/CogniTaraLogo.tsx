import React from "react";

/**
 * Official CogniTara Monochrome Brand Identity (Black & White, zero blue/cyan)
 * Vector paths extracted directly from CogniTara-Brand-Identity/cognitara-black.svg
 */

export function CogniTaraMark({
  size = 24,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="46 31 86 98"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M128.09 113.09 C109.82 131.37 80.18 131.37 61.91 113.09 C43.63 94.82 43.63 65.18 61.91 46.91 C80.18 28.63 109.82 28.63 128.09 46.91 L115.22 59.78 C104.05 48.61 85.95 48.61 74.78 59.78 C63.61 70.95 63.61 89.05 74.78 100.22 C85.95 111.39 104.05 111.39 115.22 100.22 Z"
        fill="currentColor"
      />
      <path
        d="M100.2 63.1 C104.75 75.45 104.75 75.45 124.9 80 C104.75 84.55 104.75 84.55 100.2 96.9 C95.65 84.55 95.65 84.55 88.5 80 C95.65 75.45 95.65 75.45 100.2 63.1 Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function CogniTaraWordmark({
  height = 20,
  className,
}: {
  height?: number;
  className?: string;
}) {
  // Exact bounding box of official geometric CogniTara wordmark (x: 176..460, y: 50..112)
  const width = Math.round((height * 284) / 62);
  return (
    <svg
      width={width}
      height={height}
      viewBox="176 50 284 62"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="CogniTara"
    >
      <path
        d="M215.692 59.388 C211.672 54.668 206.198 52 200.08 52 C187.384 52 178 62.304 178 75 C178 87.696 187.384 98 200.08 98 C206.198 98 211.672 95.332 215.692 90.612 L212.569 87.489 C209.188 91.33 204.864 93.584 200.08 93.584 C189.822 93.584 182.416 85.258 182.416 75 C182.416 64.742 189.822 56.416 200.08 56.416 C204.864 56.416 209.188 58.67 212.569 62.511 Z"
        fill="currentColor"
      />
      <path
        d="M235.04 64.88 C243.688 64.88 250.68 72.24 250.68 81.44 C250.68 90.64 243.688 98 235.04 98 C226.392 98 219.4 90.64 219.4 81.44 C219.4 72.24 226.392 64.88 235.04 64.88 Z M235.04 69.296 C228.83 69.296 223.816 74.724 223.816 81.44 C223.816 88.156 228.83 93.584 235.04 93.584 C241.25 93.584 246.264 88.156 246.264 81.44 C246.264 74.724 241.25 69.296 235.04 69.296 Z"
        fill="currentColor"
      />
      <path
        d="M269.08 64.88 C272.99 64.88 276.44 67.18 278.97 70.63 L278.97 65.57 L283.11 65.57 L283.11 98 C283.11 105.13 278.05 109.73 269.77 109.73 C264.02 109.73 259.19 107.43 256.66 103.52 L259.88 101.45 C261.72 104.44 265.17 106.28 269.54 106.28 C274.83 106.28 278.97 103.75 278.97 98 L278.97 91.79 C276.44 95.47 272.76 97.31 268.85 97.31 C260.8 97.31 254.36 90.18 254.36 81.21 C254.36 72.24 260.938 64.88 269.08 64.88 Z M269.08 69.296 C263.1 69.296 258.776 74.54 258.776 81.21 C258.776 87.88 263.1 92.94 269.08 92.94 C275.06 92.94 278.97 87.696 278.97 81.21 C278.97 74.54 275.06 69.296 269.08 69.296 Z"
        fill="currentColor"
      />
      <path
        d="M286.56 65.57 L290.976 65.57 L290.976 72.7 C293 67.87 297.37 64.88 302.66 64.88 C309.79 64.88 315.586 69.48 315.586 77.99 L315.586 98 L311.17 98 L311.17 78.68 C311.17 72.7 307.72 69.296 302.66 69.296 C297.6 69.296 293 72.01 290.976 77.07 L290.976 98 L286.56 98 Z"
        fill="currentColor"
      />
      <path d="M319.68 65.57 L324.096 65.57 L324.096 98 L319.68 98 Z" fill="currentColor" />
      <path
        d="M321.888 54.99 C322.808 57.52 322.808 57.52 325.338 58.44 C322.808 59.36 322.808 59.36 321.888 61.89 C320.968 59.36 320.968 59.36 318.438 58.44 C320.968 57.52 320.968 57.52 321.888 54.99 Z"
        fill="currentColor"
      />
      <path
        d="M332.56 52 L364.76 52 L364.76 54.944 L363.288 56.416 L350.868 56.416 L350.868 98 L346.452 98 L346.452 56.416 L334.032 56.416 L332.56 54.944 Z"
        fill="currentColor"
      />
      <path
        d="M382.7 64.88 C387.76 64.88 391.44 67.41 393.28 71.32 L393.28 65.57 L397.696 65.57 L397.696 98 L393.28 98 L393.28 90.87 C391.44 95.01 387.76 98 382.7 98 C374.88 98 368.44 90.64 368.44 81.44 C368.44 72.24 374.88 64.88 382.7 64.88 Z M383.16 69.296 C376.95 69.296 372.856 74.54 372.856 81.44 C372.856 88.34 376.95 93.584 383.16 93.584 C389.37 93.584 393.28 88.34 393.28 81.44 C393.28 74.54 389.37 69.296 383.16 69.296 Z"
        fill="currentColor"
      />
      <path
        d="M401.56 65.57 L405.976 65.57 L405.976 73.16 C407.54 68.1 411.22 64.88 416.51 64.88 C419.04 64.88 421.57 65.892 423.548 67.548 L422.26 70.86 C420.88 69.94 419.04 69.296 417.2 69.296 C412.14 69.296 407.77 71.55 405.976 77.07 L405.976 98 L401.56 98 Z"
        fill="currentColor"
      />
      <path
        d="M443.42 64.88 C448.48 64.88 452.16 67.41 454 71.32 L454 65.57 L458.416 65.57 L458.416 98 L454 98 L454 90.87 C452.16 95.01 448.48 98 443.42 98 C435.6 98 429.16 90.64 429.16 81.44 C429.16 72.24 435.6 64.88 443.42 64.88 Z M443.88 69.296 C437.67 69.296 433.576 74.54 433.576 81.44 C433.576 88.34 437.67 93.584 443.88 93.584 C450.09 93.584 454 88.34 454 81.44 C454 74.54 450.09 69.296 443.88 69.296 Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function CogniTaraLockup({
  markSize = 24,
  wordmarkHeight = 18,
  suffix,
  className,
}: {
  markSize?: number;
  wordmarkHeight?: number;
  suffix?: string;
  className?: string;
}) {
  return (
    <span
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: Math.max(7, Math.round(markSize * 0.34)),
        lineHeight: 1,
      }}
    >
      <CogniTaraMark size={markSize} />
      <CogniTaraWordmark height={wordmarkHeight} />
      {suffix ? (
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.02em",
            padding: "2px 7px",
            borderRadius: 999,
            background: "var(--accent-soft, rgba(23,22,20,0.07))",
            color: "var(--ink-2, rgba(23,22,20,0.65))",
          }}
        >
          {suffix}
        </span>
      ) : null}
    </span>
  );
}

/** Exact minimal two-bar menu symbol matching resurf.so */
export function ResurfMenuIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M2 7.25C2 6.83579 2.33579 6.5 2.75 6.5H21.25C21.6642 6.5 22 6.83579 22 7.25C22 7.66421 21.6642 8 21.25 8H2.75C2.33579 8 2 7.66421 2 7.25ZM2 16.75C2 16.3358 2.33579 16 2.75 16H21.25C21.6642 16 22 16.3358 22 16.75C22 17.1642 21.6642 17.5 21.25 17.5H2.75C2.33579 17.5 2 17.1642 2 16.75Z"
        fill="currentColor"
      />
    </svg>
  );
}
