import { useDriverWorkspace } from "../contexts/DriverWorkspaceContext";

export function useDriverRequests() {
  const { requests, loading, error, reconcile } = useDriverWorkspace();
  return { requests, loading, error, reload: reconcile };
}
