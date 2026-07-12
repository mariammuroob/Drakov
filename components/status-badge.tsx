type StatusBadgeProps = {
  status: string;
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const normalized = status.toLowerCase();
  const tone = normalized === "bankrupt" || normalized === "closed" ? "danger" : "neutral";
  const label = normalized.replaceAll("_", " ");

  return (
    <span className="status-badge" data-tone={tone}>
      {label}
    </span>
  );
}
