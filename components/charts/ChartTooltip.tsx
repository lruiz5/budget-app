interface ChartTooltipProps {
  visible: boolean;
  x: number;
  y: number;
  content: React.ReactNode;
}

export default function ChartTooltip({ visible, x, y, content }: ChartTooltipProps) {
  if (!visible) return null;

  return (
    <div
      className="fixed pointer-events-none bg-surface border border-border-strong rounded-lg shadow-xl p-3 z-50"
      style={{
        left: `${x + 10}px`,
        top: `${y + 10}px`,
        transform: 'translate(0, -50%)',
      }}
    >
      {content}
    </div>
  );
}
