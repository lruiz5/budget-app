interface ChartEmptyStateProps {
  icon: React.ReactNode;
  title: string;
  message: string;
  actionText?: string;
  onAction?: () => void;
}

export default function ChartEmptyState({
  icon,
  title,
  message,
  actionText,
  onAction,
}: ChartEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full py-12 px-6 text-center">
      <div className="w-16 h-16 bg-surface-secondary rounded-full flex items-center justify-center mb-4 text-text-tertiary text-2xl">
        {icon}
      </div>
      <h3 className="text-lg font-semibold text-text-primary mb-2">{title}</h3>
      <p className="text-text-secondary max-w-md mb-4">{message}</p>
      {actionText && onAction && (
        <button
          onClick={onAction}
          className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors"
        >
          {actionText}
        </button>
      )}
    </div>
  );
}
