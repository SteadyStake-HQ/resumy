"use client";

const EYE_Y = 44;

function renderGoggle(x: number) {
  return (
    <g>
      <circle cx={x} cy={EYE_Y} r="11" fill="#FFFFFF" stroke="#5A4B2E" strokeWidth="2.4" />
      <circle cx={x} cy={EYE_Y} r="14" fill="none" stroke="#9A8752" strokeWidth="1.2" opacity="0.5" />
    </g>
  );
}

function renderPupil(x: number, mood: "idle" | "working" | "happy" | "sad" | "wave") {
  if (mood === "working" || mood === "sad") {
    return <rect x={x - 4} y={EYE_Y - 1} width="8" height="2.2" rx="1" fill="#2A1F0F" />;
  }

  if (mood === "happy") {
    return (
      <path
        d={`M ${x - 5} ${EYE_Y + 1} Q ${x} ${EYE_Y - 4} ${x + 5} ${EYE_Y + 1}`}
        fill="none"
        stroke="#2A1F0F"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    );
  }

  return (
    <g>
      <circle cx={x} cy={EYE_Y} r="4.2" fill="#6B4A1E" />
      <circle cx={x} cy={EYE_Y} r="2.2" fill="#2A1F0F" />
      <circle cx={x - 0.8} cy={EYE_Y - 1.2} r="1" fill="#FFFFFF" />
    </g>
  );
}

export function BuniMascot({
  size = 56,
  mood = "idle",
}: {
  size?: number;
  mood?: "idle" | "working" | "happy" | "sad" | "wave";
}) {
  const mouth = (() => {
    if (mood === "happy") {
      return <path d="M 42 64 Q 50 72 58 64" fill="#2A1F0F" stroke="#2A1F0F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />;
    }

    if (mood === "sad") {
      return <path d="M 43 70 Q 50 64 57 70" fill="none" stroke="#2A1F0F" strokeWidth="2" strokeLinecap="round" />;
    }

    if (mood === "working") {
      return <ellipse cx="50" cy="67" rx="5" ry="3" fill="#2A1F0F" />;
    }

    if (mood === "wave") {
      return <path d="M 44 65 Q 50 70 56 65" fill="none" stroke="#2A1F0F" strokeWidth="2" strokeLinecap="round" />;
    }

    return <path d="M 46 66 Q 50 69 54 66" fill="none" stroke="#2A1F0F" strokeWidth="2" strokeLinecap="round" />;
  })();

  return (
    <svg width={size} height={size} viewBox="0 0 100 110" style={{ display: "block" }}>
      <defs>
        <linearGradient id="buniBody" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#FFE58A" />
          <stop offset="60%" stopColor="#FFD14A" />
          <stop offset="100%" stopColor="#E8B024" />
        </linearGradient>
        <linearGradient id="buniOverall" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#6FA8D6" />
          <stop offset="100%" stopColor="#4A82B5" />
        </linearGradient>
      </defs>

      <path d="M 48 14 L 50 8 L 52 14" stroke="#8A6F32" strokeWidth="2" strokeLinecap="round" fill="none" />
      <path
        d="M 25 45 C 25 25 35 15 50 15 C 65 15 75 25 75 45 L 75 85 C 75 95 67 100 50 100 C 33 100 25 95 25 85 Z"
        fill="url(#buniBody)"
        stroke="#C98F18"
        strokeWidth="1.8"
      />
      <path
        d="M 30 62 L 70 62 L 70 92 C 70 96 65 98 50 98 C 35 98 30 96 30 92 Z"
        fill="url(#buniOverall)"
        stroke="#2E5682"
        strokeWidth="1.5"
      />
      <path d="M 37 62 L 42 50" stroke="#2E5682" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <path d="M 63 62 L 58 50" stroke="#2E5682" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <rect x="40" y="52" width="4" height="4" rx="0.8" fill="#E8B024" stroke="#2E5682" strokeWidth="1" />
      <rect x="56" y="52" width="4" height="4" rx="0.8" fill="#E8B024" stroke="#2E5682" strokeWidth="1" />
      <rect x="44" y="72" width="12" height="10" rx="1.5" fill="none" stroke="#2E5682" strokeWidth="1.2" />
      <rect x="23" y="41" width="54" height="6" fill="#5A4B2E" />
      {renderGoggle(38)}
      {renderGoggle(62)}
      {renderPupil(38, mood)}
      {renderPupil(62, mood)}

      {mood === "happy" || mood === "working" || mood === "wave" ? (
        <g fill="#F58A7A" opacity="0.55">
          <ellipse cx="30" cy="62" rx="3.5" ry="2" />
          <ellipse cx="70" cy="62" rx="3.5" ry="2" />
        </g>
      ) : null}

      {mouth}

      {mood === "wave" ? (
        <path d="M 25 70 Q 14 58 18 46" stroke="#C98F18" strokeWidth="4" strokeLinecap="round" fill="url(#buniBody)" />
      ) : (
        <>
          <path d="M 25 72 Q 20 78 22 86" stroke="#C98F18" strokeWidth="3.5" strokeLinecap="round" fill="none" />
          <path d="M 75 72 Q 80 78 78 86" stroke="#C98F18" strokeWidth="3.5" strokeLinecap="round" fill="none" />
        </>
      )}

      <ellipse cx="40" cy="103" rx="6" ry="3.5" fill="#2A1F0F" />
      <ellipse cx="60" cy="103" rx="6" ry="3.5" fill="#2A1F0F" />
      <path d="M 82 28 l 1.4 2.6 l 2.6 1.4 l -2.6 1.4 l -1.4 2.6 l -1.4 -2.6 l -2.6 -1.4 l 2.6 -1.4 Z" fill="#FFEC9A" />
    </svg>
  );
}
