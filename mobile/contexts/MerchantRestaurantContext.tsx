import * as SecureStore from "expo-secure-store";
import { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Platform } from "react-native";

import { listMyRestaurants } from "../services/merchantService";
import { onSessionCleared } from "../services/sessionLifecycle";
import { MerchantRestaurant } from "../types/merchant.types";

const KEY = "letsgoride.merchant.selected_restaurant";
type MerchantRestaurantState = { restaurants: MerchantRestaurant[]; selected: MerchantRestaurant | null; loading: boolean; error: string | null; selectRestaurant: (id: string) => Promise<void>; refreshRestaurants: () => Promise<void> };
const Context = createContext<MerchantRestaurantState | null>(null);

async function readSelected() { return Platform.OS === "web" ? globalThis.localStorage?.getItem(KEY) || null : SecureStore.getItemAsync(KEY); }
async function saveSelected(id: string) { if (Platform.OS === "web") globalThis.localStorage?.setItem(KEY, id); else await SecureStore.setItemAsync(KEY, id); }

export function MerchantRestaurantProvider({ children }: { children: ReactNode }) {
  const [restaurants, setRestaurants] = useState<MerchantRestaurant[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  useEffect(() => onSessionCleared(() => { selectedIdRef.current = null; setRestaurants([]); setSelectedId(null); setError(null); }), []);
  const refreshRestaurants = useCallback(async () => {
    try {
      setError(null);
      const [next, stored] = await Promise.all([listMyRestaurants(), readSelected()]);
      const preferredId = selectedIdRef.current || stored;
      const nextId = next.some((item) => item.id === preferredId) ? preferredId : next[0]?.id || null;
      selectedIdRef.current = nextId;
      setRestaurants(next); setSelectedId(nextId);
      if (nextId) await saveSelected(nextId);
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to load merchant locations."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { refreshRestaurants(); }, [refreshRestaurants]);
  const selectRestaurant = useCallback(async (id: string) => { if (!restaurants.some((item) => item.id === id)) return; selectedIdRef.current = id; setSelectedId(id); await saveSelected(id); }, [restaurants]);
  const value = useMemo(() => ({ restaurants, selected: restaurants.find((item) => item.id === selectedId) || null, loading, error, selectRestaurant, refreshRestaurants }), [restaurants, selectedId, loading, error, selectRestaurant, refreshRestaurants]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useMerchantRestaurant() { const value = useContext(Context); if (!value) throw new Error("Merchant restaurant context is missing."); return value; }
