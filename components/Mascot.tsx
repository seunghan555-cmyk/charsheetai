
import React from "react";

interface MascotProps {
  size?: number;
  className?: string;
  emotion?: "happy" | "thinking" | "excited" | "sleepy";
}

export const Mascot: React.FC<MascotProps> = ({ size = 40, className = "", emotion = "happy" }) => {
  // Simple color palette based on app theme
  const mainColor = "#0F4C81"; // Classic Blue
  const accentColor = "#F59E0B"; // Amber for antenna
  const faceColor = "#FFFFFF";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={`inline-block ${className}`}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Bounce Animation Style */}
      <style>
        {`
          @keyframes blink { 0%, 100% { transform: scaleY(1); } 50% { transform: scaleY(0.1); } }
          .eye { transform-origin: center; animation: blink 3s infinite; }
          .antenna { transform-origin: bottom center; animation: swing 2s infinite ease-in-out; }
          @keyframes swing { 0%, 100% { transform: rotate(-5deg); } 50% { transform: rotate(5deg); } }
        `}
      </style>

      {/* Antenna */}
      <g className={emotion === "thinking" ? "antenna" : ""}>
        <line x1="50" y1="25" x2="50" y2="10" stroke={mainColor} strokeWidth="4" strokeLinecap="round" />
        <circle cx="50" cy="10" r="6" fill={accentColor} />
      </g>

      {/* Body Shape (Squircle) */}
      <rect x="20" y="25" width="60" height="55" rx="12" fill={mainColor} />
      
      {/* Screen/Face Area */}
      <rect x="28" y="33" width="44" height="32" rx="6" fill="#1e293b" />

      {/* Face Expressions */}
      {emotion === "happy" && (
        <>
          <circle cx="40" cy="45" r="4" fill={faceColor} className="eye" />
          <circle cx="60" cy="45" r="4" fill={faceColor} className="eye" />
          <path d="M 42 55 Q 50 60 58 55" stroke={faceColor} strokeWidth="2.5" fill="none" strokeLinecap="round" />
          {/* Cheeks */}
          <circle cx="36" cy="52" r="2" fill="#ec4899" opacity="0.6" />
          <circle cx="64" cy="52" r="2" fill="#ec4899" opacity="0.6" />
        </>
      )}

      {emotion === "excited" && (
        <>
          <path d="M 36 45 L 40 41 L 44 45" stroke={faceColor} strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M 56 45 L 60 41 L 64 45" stroke={faceColor} strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M 40 55 Q 50 62 60 55" stroke={faceColor} strokeWidth="2.5" fill="none" strokeLinecap="round" />
        </>
      )}

      {emotion === "thinking" && (
        <>
          <circle cx="38" cy="45" r="3" fill={faceColor} />
          <circle cx="62" cy="45" r="4" fill={faceColor} />
          <line x1="45" y1="55" x2="55" y2="55" stroke={faceColor} strokeWidth="2.5" strokeLinecap="round" />
        </>
      )}

      {emotion === "sleepy" && (
        <>
          <path d="M 36 46 Q 40 48 44 46" stroke={faceColor} strokeWidth="2" fill="none" />
          <path d="M 56 46 Q 60 48 64 46" stroke={faceColor} strokeWidth="2" fill="none" />
          <circle cx="50" cy="55" r="2" fill={faceColor} />
        </>
      )}

      {/* Reflection on head */}
      <path d="M 25 30 Q 30 25 35 30" stroke="white" strokeWidth="2" strokeOpacity="0.3" fill="none" />
    </svg>
  );
};
