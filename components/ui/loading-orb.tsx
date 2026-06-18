"use client";

import { BuniMascot } from "@/components/profile/buni-mascot";

type LoadingOrbProps = {
  label: string;
};

export function LoadingOrb({ label }: LoadingOrbProps) {
  return (
    <div className="loading-orb" role="status" aria-live="polite" aria-label={label}>
      <span className="loading-orb__mascot" aria-hidden="true">
        <BuniMascot size={42} mood="working" />
        <span className="loading-orb__ring" />
        <span className="loading-orb__dot" />
      </span>
      <span className="loading-orb__content">
        <span className="loading-orb__label">{label}</span>
        <span className="loading-orb__bar" aria-hidden="true">
          <span className="loading-orb__bar-fill" />
        </span>
      </span>
    </div>
  );
}
