import React from "react";

// The real Stash brand mark (brand/stash-mark.svg) — a white storage-box
// glyph in a black circle. Rendered inline (not <Img src>) so it scales
// crisply at any size used across the video.
export const StashIcon: React.FC<{ size?: number }> = ({ size = 56 }) => (
  <svg width={size} height={size} viewBox="0 0 280 280">
    <circle cx="140" cy="140" r="140" fill="#000000" />
    <path
      fill="#FFFFFF"
      d="M85 86c-4.4 0-8 3.6-8 8v10c0 4.4 3.6 8 8 8h110c4.4 0 8-3.6 8-8V94c0-4.4-3.6-8-8-8H85Z"
    />
    <path
      fill="#FFFFFF"
      d="M90 120h100l-7.7 59.7a10 10 0 0 1-9.9 8.3h-64.8a10 10 0 0 1-9.9-8.3L90 120Z"
    />
    <path
      fill="#000000"
      d="M124 134h32a5 5 0 0 1 5 5v1a5 5 0 0 1-5 5h-32a5 5 0 0 1-5-5v-1a5 5 0 0 1 5-5Z"
    />
  </svg>
);
