export function AdminAuthShell({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <img
            src="/toronto-golden-barbers-logo-trimmed.png"
            alt="Toronto Golden Barbers"
            width={1017}
            height={952}
            className="h-auto w-40 select-none"
            draggable={false}
          />
          <h1 className="mt-4 font-serif text-2xl text-foreground">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground text-pretty">
            {subtitle}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card/70 p-6 shadow-2xl backdrop-blur-sm">
          {children}
        </div>
        <p className="mt-6 text-center text-xs uppercase tracking-[0.3em] text-muted-foreground/70">
          Toronto Golden Barbers
        </p>
      </div>
    </main>
  )
}
