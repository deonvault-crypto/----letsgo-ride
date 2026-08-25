import { useDriverWorkspace } from "../contexts/DriverWorkspaceContext";

export function useDriverRides() {
  const { rides, loading, error, reconcile } = useDriverWorkspace();
  return { rides, loading, error, reload: reconcile };
}
