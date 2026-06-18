"use client";

import { useState } from "react";
import { BuniMascot } from "@/components/profile/buni-mascot";

/**
 * Tailor-page variant of the hero mascot. Same shape as ProfileHeroMascot but
 * with a tailor-themed bubble message.
 */
export function TailorHeroMascot() {
  const [isBubbleVisible, setIsBubbleVisible] = useState(false);

  return (
    <div
      style={{
        position: "relative",
        width: 248,
        minWidth: 248,
        height: 150,
      }}
    >
      <div
        aria-hidden={!isBubbleVisible}
        style={{
          position: "absolute",
          top: 26,
          left: 0,
          transform: isBubbleVisible
            ? "translate3d(0, 0, 0) scale(1)"
            : "translate3d(16px, 10px, 0) scale(0.92)",
          transformOrigin: "100% 78%",
          opacity: isBubbleVisible ? 1 : 0,
          transition:
            "opacity 220ms ease, transform 340ms cubic-bezier(.22,1.2,.36,1)",
          pointerEvents: "none",
          zIndex: 3,
        }}
      >
        <div
          style={{
            position: "relative",
            display: "inline-flex",
            alignItems: "center",
            minHeight: 38,
            padding: "9px 14px",
            background: "#fff",
            borderRadius: "16px 16px 16px 4px",
            fontSize: 11.5,
            fontWeight: 700,
            color: "#2F2A1F",
            fontFamily: "var(--font-ibm-plex-mono), monospace",
            whiteSpace: "nowrap",
            boxShadow: "0 10px 24px -10px rgba(46,38,64,0.3)",
          }}
        >
          let&apos;s tailor it sharp ✂︎
          <span
            style={{
              position: "absolute",
              right: 30,
              bottom: -7,
              width: 14,
              height: 14,
              background: "#fff",
              transform: "rotate(45deg)",
              borderRadius: 2,
              boxShadow: "6px 6px 18px -14px rgba(46,38,64,0.2)",
            }}
          />
        </div>
      </div>

      <button
        type="button"
        onClick={() => setIsBubbleVisible((current) => !current)}
        aria-label={
          isBubbleVisible ? "Hide mascot message" : "Show mascot message"
        }
        style={{
          position: "absolute",
          top: 8,
          right: 0,
          width: 136,
          height: 136,
          borderRadius: 999,
          background: "rgba(255,255,255,0.4)",
          border: "2.5px solid rgba(255,255,255,0.7)",
          display: "grid",
          placeItems: "center",
          boxShadow: "0 15px 40px -10px rgba(46,38,64,0.3)",
          backdropFilter: "blur(8px)",
          cursor: "pointer",
          padding: 0,
        }}
      >
        <div
          style={{
            transform: isBubbleVisible
              ? "translateY(-2px) scale(1.02)"
              : "translateY(0) scale(1)",
            transition: "transform 280ms cubic-bezier(.22,1.2,.36,1)",
          }}
        >
          <BuniMascot
            size={120}
            mood={isBubbleVisible ? "wave" : "happy"}
          />
        </div>
      </button>
    </div>
  );
}
