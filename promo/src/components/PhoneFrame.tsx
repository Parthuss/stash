import React from "react";
import { AbsoluteFill } from "remotion";
import { theme } from "../theme";

// Generic device chrome — a rounded bezel + notch silhouette. Not modeled on
// any specific manufacturer's exact dimensions, just enough to read as "a
// phone" so scenes 1-4 stay legible as an on-device flow.
export const PhoneFrame: React.FC<{ children: React.ReactNode; darkStatusBar?: boolean }> = ({
  children,
  darkStatusBar = false,
}) => {
  return (
    <AbsoluteFill style={{ background: theme.bg }}>
      <AbsoluteFill
        style={{
          margin: 24,
          borderRadius: 64,
          border: `10px solid #08090C`,
          overflow: "hidden",
          background: "#000",
          boxShadow: "0 40px 80px rgba(0,0,0,0.6)",
        }}
      >
        {/* status bar */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 64,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 40px",
            zIndex: 20,
            color: darkStatusBar ? theme.text : "#fff",
            fontFamily: theme.font,
            fontSize: 22,
            fontWeight: 600,
            textShadow: darkStatusBar ? "none" : "0 1px 4px rgba(0,0,0,0.5)",
          }}
        >
          <span>9:41</span>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 18 }}>􀙇</span>
            <span style={{ fontSize: 18 }}>􀛨</span>
          </div>
        </div>
        {/* notch */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: "50%",
            transform: "translateX(-50%)",
            width: 180,
            height: 34,
            background: "#08090C",
            borderBottomLeftRadius: 20,
            borderBottomRightRadius: 20,
            zIndex: 30,
          }}
        />
        {children}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
