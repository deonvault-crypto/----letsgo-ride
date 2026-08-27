import { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import {
  getActiveCourierDelivery,
  getCourierEarnings,
  getCourierWorkspace,
  listCourierOffers,
} from "../services/operationsService";
import type { CourierDelivery, CourierOffer } from "../types/courier.types";
import type { CourierEarningsSummary, CourierProfile, CourierShift, CourierWorkspaceSnapshot } from "../types/operations.types";
import { applyCourierDeliveryEvent, authoritativeDelivery } from "../utils/courierDeliveryRealtime";
import { applyCourierOfferEvent, sortCourierOffers, versionsForOffers } from "../utils/courierOfferRealtime";
import { useRealtime } from "./RealtimeContext";
import { useSession } from "./SessionContext";


const ACTIVE_STATUSES = new Set(["ASSIGNED", "COURIER_TO_PICKUP", "PICKED_UP", "IN_TRANSIT", "ARRIVING"]);
const TERMINAL_STATUSES = new Set(["DELIVERED", "CANCELLED", "FAILED"]);

type CourierWorkspaceState = {
  profile: CourierProfile | null;
  active: CourierDelivery | null;
  earnings: CourierEarningsSummary | null;
  offers: CourierOffer[];
  nextShift: CourierShift | null;
  loading: boolean;
  error: string | null;
  setError: (error: string | null) => void;
  reconcile: () => Promise<void>;
  reconcileOffers: () => Promise<void>;
  applyOnlineProfile: (profile: CourierProfile) => Promise<void>;
  acceptClaimedDelivery: (delivery: CourierDelivery) => void;
  removeOffer: (deliveryId: string) => void;
};

const CourierWorkspaceContext = createContext<CourierWorkspaceState | null>(null);

export function CourierWorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const { reconciliationRevision, subscribe } = useRealtime();
  const [profile, setProfile] = useState<CourierProfile | null>(null);
  const [active, setActive] = useState<CourierDelivery | null>(null);
  const [earnings, setEarnings] = useState<CourierEarningsSummary | null>(null);
  const [offers, setOffers] = useState<CourierOffer[]>([]);
  const [nextShift, setNextShift] = useState<CourierShift | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const profileRef = useRef<CourierProfile | null>(null);
  const activeRef = useRef<CourierDelivery | null>(null);
  const offersRef = useRef<CourierOffer[]>([]);
  const offerVersionsRef = useRef(new Map<string, number>());
  const mounted = useRef(true);
  const workspaceInFlight = useRef<Promise<void> | null>(null);
  const offersInFlight = useRef<Promise<void> | null>(null);
  const activeInFlight = useRef<Promise<void> | null>(null);
  const terminalRefreshInFlight = useRef<Promise<void> | null>(null);
  const refreshAfterTerminalRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const seenReconciliationRevision = useRef(reconciliationRevision);
  const sessionGeneration = useRef(0);

  const replaceOffers = useCallback((next: CourierOffer[]) => {
    const sorted = sortCourierOffers(next);
    offersRef.current = sorted;
    offerVersionsRef.current = versionsForOffers(sorted);
    setOffers(sorted);
  }, []);

  const acceptSnapshot = useCallback((snapshot: CourierWorkspaceSnapshot) => {
    profileRef.current = snapshot.profile;
    activeRef.current = snapshot.active_delivery;
    setProfile(snapshot.profile);
    setActive(snapshot.active_delivery);
    setEarnings(snapshot.earnings);
    setNextShift(snapshot.next_shift);
    replaceOffers(snapshot.active_delivery ? [] : snapshot.offers);
  }, [replaceOffers]);

  const resetWorkspace = useCallback(() => {
    workspaceInFlight.current = null;
    offersInFlight.current = null;
    activeInFlight.current = null;
    terminalRefreshInFlight.current = null;
    profileRef.current = null;
    activeRef.current = null;
    offerVersionsRef.current = new Map();
    setProfile(null);
    setActive(null);
    setEarnings(null);
    setNextShift(null);
    replaceOffers([]);
    setError(null);
  }, [replaceOffers]);

  const reconcile = useCallback(() => {
    if (workspaceInFlight.current) return workspaceInFlight.current;
    const generation = sessionGeneration.current;
    let request!: Promise<void>;
    request = (async () => {
      try {
        const snapshot = await getCourierWorkspace();
        if (!mounted.current || generation !== sessionGeneration.current) return;
        acceptSnapshot(snapshot);
        setError(null);
      } catch (err) {
        if (mounted.current && generation === sessionGeneration.current) {
          setError(err instanceof Error ? err.message : "Unable to load your courier workspace.");
        }
      } finally {
        if (mounted.current && generation === sessionGeneration.current) setLoading(false);
        if (workspaceInFlight.current === request) workspaceInFlight.current = null;
      }
    })();
    workspaceInFlight.current = request;
    return request;
  }, [acceptSnapshot]);

  const reconcileOffers = useCallback(() => {
    if (offersInFlight.current) return offersInFlight.current;
    if (!profileRef.current?.online || profileRef.current.status !== "APPROVED" || activeRef.current) {
      replaceOffers([]);
      return Promise.resolve();
    }
    const generation = sessionGeneration.current;
    let request!: Promise<void>;
    request = listCourierOffers()
      .then((next) => {
        if (mounted.current && generation === sessionGeneration.current && !activeRef.current) replaceOffers(next);
      })
      .catch((err) => {
        if (mounted.current && generation === sessionGeneration.current) {
          setError(err instanceof Error ? err.message : "Unable to refresh offers.");
        }
      })
      .finally(() => { if (offersInFlight.current === request) offersInFlight.current = null; });
    offersInFlight.current = request;
    return request;
  }, [replaceOffers]);

  const reconcileActive = useCallback(() => {
    if (activeInFlight.current) return activeInFlight.current;
    const generation = sessionGeneration.current;
    let request!: Promise<void>;
    request = getActiveCourierDelivery()
      .then((next) => {
        if (!mounted.current || generation !== sessionGeneration.current) return;
        const previous = activeRef.current;
        activeRef.current = next;
        setActive(next);
        if (next) replaceOffers([]);
        else if (previous) void refreshAfterTerminalRef.current();
      })
      .catch((err) => console.warn("courier_active_reconciliation_failed", err))
      .finally(() => { if (activeInFlight.current === request) activeInFlight.current = null; });
    activeInFlight.current = request;
    return request;
  }, [replaceOffers]);

  const refreshAfterTerminal = useCallback(() => {
    if (terminalRefreshInFlight.current) return terminalRefreshInFlight.current;
    const generation = sessionGeneration.current;
    let request!: Promise<void>;
    request = (async () => {
      const shouldLoadOffers = Boolean(profileRef.current?.online && profileRef.current.status === "APPROVED");
      const [nextEarnings, nextOffers] = await Promise.all([
        getCourierEarnings(),
        shouldLoadOffers ? listCourierOffers() : Promise.resolve([]),
      ]);
      if (!mounted.current || generation !== sessionGeneration.current || activeRef.current) return;
      setEarnings(nextEarnings);
      replaceOffers(nextOffers);
    })()
      .catch((err) => console.warn("courier_terminal_reconciliation_failed", err))
      .finally(() => { if (terminalRefreshInFlight.current === request) terminalRefreshInFlight.current = null; });
    terminalRefreshInFlight.current = request;
    return request;
  }, [replaceOffers]);
  refreshAfterTerminalRef.current = refreshAfterTerminal;

  useEffect(() => {
    mounted.current = true;
    sessionGeneration.current += 1;
    resetWorkspace();
    if (user?.role === "courier") {
      setLoading(true);
      void reconcile();
    } else setLoading(false);
    return () => {
      mounted.current = false;
      sessionGeneration.current += 1;
    };
  }, [reconcile, resetWorkspace, user?.id, user?.role]);

  useEffect(() => subscribe((event) => {
    if (event.resource_type === "courier_offer") {
      if (activeRef.current || !profileRef.current?.online) return;
      const result = applyCourierOfferEvent(offersRef.current, offerVersionsRef.current, event);
      if (result.needsReconciliation) {
        void reconcileOffers();
        return;
      }
      if (!result.applied) return;
      offersRef.current = result.offers;
      offerVersionsRef.current = result.versions;
      setOffers(result.offers);
      return;
    }
    if (event.resource_type !== "courier_delivery") return;
    const current = activeRef.current;
    if (current?.id === event.resource_id) {
      const result = applyCourierDeliveryEvent(current, event);
      if (result.needsReconciliation) {
        void reconcileActive();
        return;
      }
      if (!result.applied) return;
      if (TERMINAL_STATUSES.has(result.delivery.status)) {
        activeRef.current = null;
        setActive(null);
        void refreshAfterTerminal();
      } else {
        activeRef.current = result.delivery;
        setActive(result.delivery);
      }
      return;
    }
    if (
      !current
      && event.payload.courier_user_id === user?.id
      && typeof event.payload.status === "string"
      && ACTIVE_STATUSES.has(event.payload.status)
    ) {
      replaceOffers([]);
      void reconcileActive();
    }
  }), [reconcileActive, reconcileOffers, refreshAfterTerminal, replaceOffers, subscribe, user?.id]);

  useEffect(() => {
    if (seenReconciliationRevision.current === reconciliationRevision) return;
    seenReconciliationRevision.current = reconciliationRevision;
    if (user?.role === "courier") void reconcile();
  }, [reconcile, reconciliationRevision, user?.role]);

  const applyOnlineProfile = useCallback(async (next: CourierProfile) => {
    profileRef.current = next;
    setProfile(next);
    if (!next.online) {
      replaceOffers([]);
      try {
        const nextEarnings = await getCourierEarnings();
        if (mounted.current) setEarnings(nextEarnings);
      } catch (err) {
        console.warn("courier_offline_earnings_reconciliation_failed", err);
      }
      return;
    }
    if (!activeRef.current) await reconcileOffers();
  }, [reconcileOffers, replaceOffers]);

  const acceptClaimedDelivery = useCallback((delivery: CourierDelivery) => {
    const accepted = authoritativeDelivery(activeRef.current, delivery);
    activeRef.current = accepted;
    setActive(accepted);
    replaceOffers([]);
  }, [replaceOffers]);

  const removeOffer = useCallback((deliveryId: string) => {
    const next = offersRef.current.filter((offer) => offer.id !== deliveryId);
    offersRef.current = next;
    setOffers(next);
  }, []);

  const value = useMemo(() => ({
    profile, active, earnings, offers, nextShift, loading, error, setError,
    reconcile, reconcileOffers, applyOnlineProfile, acceptClaimedDelivery, removeOffer,
  }), [
    profile, active, earnings, offers, nextShift, loading, error,
    reconcile, reconcileOffers, applyOnlineProfile, acceptClaimedDelivery, removeOffer,
  ]);
  return <CourierWorkspaceContext.Provider value={value}>{children}</CourierWorkspaceContext.Provider>;
}

export function useCourierWorkspace() {
  const context = useContext(CourierWorkspaceContext);
  if (!context) throw new Error("useCourierWorkspace must be used inside CourierWorkspaceProvider.");
  return context;
}
