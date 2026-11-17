/** Le petit docteur : mascotte de l'assistant (dessin vectoriel, sans image à charger). */
export function Docteur({ taille = 40, className }: { taille?: number; className?: string }) {
  return (
    <svg
      width={taille}
      height={taille}
      viewBox="0 0 64 64"
      role="img"
      aria-label="Le Dr Rodier"
      className={className}
    >
      <defs>
        <linearGradient id="docteur-fond" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6aa6f0" />
          <stop offset="1" stopColor="#3a6fd0" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="32" fill="url(#docteur-fond)" />
      {/* Blouse */}
      <path d="M8 62c2-13 11-19 24-19s22 6 24 19z" fill="#f6f7f9" />
      <path d="M32 43l-6 19h12z" fill="#dfe6ef" />
      {/* Stéthoscope */}
      <path d="M22 44c0 9 4 12 10 12" fill="none" stroke="#2b3a52" strokeWidth="2" strokeLinecap="round" />
      <circle cx="33" cy="56" r="2.4" fill="#2b3a52" />
      {/* Visage */}
      <circle cx="32" cy="27" r="13" fill="#f4c9a4" />
      {/* Cheveux */}
      <path d="M19 25c0-9 6-14 13-14s13 5 13 14c-3-5-8-7-13-7s-10 2-13 7z" fill="#4a3426" />
      {/* Yeux, sourire */}
      <circle cx="27" cy="28" r="1.5" fill="#2b2118" />
      <circle cx="37" cy="28" r="1.5" fill="#2b2118" />
      <path d="M27.5 33c2.5 2.6 6.5 2.6 9 0" fill="none" stroke="#a4523a" strokeWidth="1.6" strokeLinecap="round" />
      {/* Miroir frontal */}
      <circle cx="32" cy="15.5" r="3.6" fill="#e9eef5" stroke="#9aa9bd" strokeWidth="1" />
      <circle cx="32" cy="15.5" r="1.2" fill="#9aa9bd" />
    </svg>
  );
}
