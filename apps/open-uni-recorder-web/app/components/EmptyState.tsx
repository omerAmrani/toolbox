interface Props {
  message: string;
  icon?: string;
  loading?: boolean;
  children?: React.ReactNode;
}

export function EmptyState({ message, icon, loading, children }: Props) {
  return (
    <div className="empty-state">
      {loading && <div className="spinner-inline" />}
      {icon && <div className="icon">{icon}</div>}
      <p>{message}</p>
      {children}
    </div>
  );
}
