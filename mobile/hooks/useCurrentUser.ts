import { useSession } from "../contexts/SessionContext";

export function useCurrentUser() {
  const { user, loading, error, isGuest, refreshSession, updateUser, invalidateSession, logout } = useSession();
  return { user, loading, error, isGuest, reload: refreshSession, updateUser, invalidateSession, logout };
}
