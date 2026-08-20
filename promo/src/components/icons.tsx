import React from "react";

// Generic outline glyphs — heart / comment / share / bookmark / dots are
// common cross-app iconography, not any one app's trademarked artwork.
const stroke = { fill: "none", stroke: "#fff", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

export const HeartIcon: React.FC<{ size?: number }> = ({ size = 28 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...stroke}>
    <path d="M12 20.5s-7.5-4.6-9.8-9.1C.6 8 2 4.5 5.6 4C8 3.7 10 5 12 7.5C14 5 16 3.7 18.4 4C22 4.5 23.4 8 21.8 11.4C19.5 15.9 12 20.5 12 20.5Z" />
  </svg>
);

export const CommentIcon: React.FC<{ size?: number }> = ({ size = 28 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...stroke}>
    <path d="M21 12a8 8 0 1 1-3.6-6.7L21 4l-1.2 3.9A7.9 7.9 0 0 1 21 12Z" />
  </svg>
);

export const ShareArrowIcon: React.FC<{ size?: number }> = ({ size = 28 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...stroke}>
    <path d="M22 3 2 11l7 3.2L12 22l4-8.2L22 3Z" />
    <path d="M22 3 9 14.2" />
  </svg>
);

export const BookmarkIcon: React.FC<{ size?: number; filled?: boolean; color?: string }> = ({
  size = 28,
  filled = false,
  color = "#fff",
}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? color : "none"} stroke={color} strokeWidth={2} strokeLinejoin="round">
    <path d="M6 3h12v18l-6-4-6 4V3Z" />
  </svg>
);

export const DotsIcon: React.FC<{ size?: number }> = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 6" fill="#fff">
    <circle cx="3" cy="3" r="2.4" />
    <circle cx="12" cy="3" r="2.4" />
    <circle cx="21" cy="3" r="2.4" />
  </svg>
);

export const MusicNoteIcon: React.FC<{ size?: number }> = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="#fff">
    <path d="M9 18V5l12-2v13" stroke="#fff" strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="16" r="3" />
  </svg>
);
