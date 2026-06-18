"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";

export function LogoutButton({
  variant = "default",
}: {
  variant?: "default" | "hero";
}) {
  const [isPending, setIsPending] = useState(false);

  const handleLogout = async () => {
    setIsPending(true);
    await signOut({ callbackUrl: "/" });
  };

  const isHero = variant === "hero";

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={isPending}
      aria-label={isPending ? "Signing out" : "Log out"}
      className={isHero ? "nav-icon-link" : "logout-icon-button"}
      style={
        isHero
          ? {
              width: 42,
              height: 42,
              borderRadius: 999,
              display: "grid",
              placeItems: "center",
              border: "1.5px solid rgba(255,255,255,0.46)",
              background: "rgba(255,255,255,0.18)",
              color: "#fff",
              backdropFilter: "blur(6px)",
              opacity: isPending ? 0.65 : 1,
            }
          : { opacity: isPending ? 0.65 : 1 }
      }
    >
      <svg
        className="nav-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.9"
        aria-hidden="true"
      >
        <path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" />
        <path d="M14 8l4 4-4 4" />
        <path d="M8 12h10" />
      </svg>
    </button>
  );
}
