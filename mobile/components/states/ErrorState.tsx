import { AppNotice } from "../ui/AppNotice";

export function ErrorState({
  title = "Unable to load data",
  message,
  onRetry,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
}) {
  return <AppNotice title={title} message={message} actionLabel={onRetry ? "Retry" : undefined} onAction={onRetry} />;
}
