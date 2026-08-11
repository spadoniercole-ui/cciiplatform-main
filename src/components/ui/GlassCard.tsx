// components/ui/GlassCard.tsx
export default function GlassCard({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`bg-white/70 backdrop-blur-mica border border-white/20 shadow-sm rounded-2xl p-6 ${className}`}
    >
      {children}
    </div>
  );
}
