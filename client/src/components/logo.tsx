function BasisPointMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <rect x="0.5" y="0.5" width="31" height="31" rx="7" className="fill-primary/10 stroke-primary/30" />
      <path
        d="M6.5 21.5L13 13.5L18 18.5L25.5 9"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M19.5 9H25.5V15"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 ${className ?? ""}`} data-testid="logo-basispoint">
      <BasisPointMark className="h-8 w-8 shrink-0 text-primary" />
      <span className="font-serif font-semibold text-xl leading-none tracking-tight text-foreground">
        Basis<span className="text-primary">Point</span>
      </span>
    </div>
  );
}
