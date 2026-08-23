import { createContext, ReactNode, useContext, useMemo, useState } from "react";

import { RoutingPoint } from "../types/routing.types";

export type LocationChoice = {
  label: string;
  address: string;
  location: RoutingPoint;
  placeId?: string | null;
};

type LocationDraftContextValue = {
  pickup: LocationChoice | null;
  dropoff: LocationChoice | null;
  setPickup: (choice: LocationChoice | null) => void;
  setDropoff: (choice: LocationChoice | null) => void;
  clear: () => void;
};

const LocationDraftContext = createContext<LocationDraftContextValue | null>(null);

export function LocationDraftProvider({ children }: { children: ReactNode }) {
  const [pickup, setPickup] = useState<LocationChoice | null>(null);
  const [dropoff, setDropoff] = useState<LocationChoice | null>(null);

  const value = useMemo(
    () => ({
      pickup,
      dropoff,
      setPickup,
      setDropoff,
      clear: () => {
        setPickup(null);
        setDropoff(null);
      },
    }),
    [pickup, dropoff],
  );

  return <LocationDraftContext.Provider value={value}>{children}</LocationDraftContext.Provider>;
}

export function useLocationDraft() {
  const context = useContext(LocationDraftContext);
  if (!context) throw new Error("useLocationDraft must be used inside LocationDraftProvider.");
  return context;
}
