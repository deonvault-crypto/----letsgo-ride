import fs from "fs";
import path from "path";
import type { PropsWithChildren } from "react";
import { act, renderHook, waitFor } from "@testing-library/react-native";

import { CourierWorkspaceProvider, useCourierWorkspace } from "../contexts/CourierWorkspaceContext";
import {
  getActiveCourierDelivery,
  getCourierEarnings,
  getCourierWorkspace,
  listCourierOffers,
} from "../services/operationsService";
import type { RealtimeEventEnvelope } from "../types/realtime.types";
import { selectedCourierOfferId } from "../utils/courierOfferRealtime";


let mockListener: ((event: RealtimeEventEnvelope) => void) | null = null;
let mockRevision = 0;

jest.mock("../contexts/RealtimeContext", () => ({
  useRealtime: () => ({
    reconciliationRevision: mockRevision,
    subscribe: (next: (event: RealtimeEventEnvelope) => void) => {
      mockListener = next;
      return jest.fn();
    },
  }),
}));

jest.mock("../contexts/SessionContext", () => ({
  useSession: () => ({ user: { id: "courier-1", role: "courier", name: "Courier" } }),
}));

jest.mock("../services/operationsService", () => ({
  getActiveCourierDelivery: jest.fn(),
  getCourierEarnings: jest.fn(),
  getCourierWorkspace: jest.fn(),
  listCourierOffers: jest.fn(),
}));

const profile = (overrides: Record<string, unknown> = {}) => ({
  id: "profile-1",
  user_id: "courier-1",
  transport_mode: "motorbike",
  status: "APPROVED",
  online: true,
  ...overrides,
}) as any;

const offer = (id = "offer-1", version = 1, overrides: Record<string, unknown> = {}) => ({
  id,
  realtime_version: version,
  source_type: "COURIER_REQUEST",
  status: "MATCHING",
  quote_status: "READY",
  pickup_address: "Joina City, Harare",
  dropoff_address: "Borrowdale, Harare",
  price_usd: 7,
  courier_payout_usd: 5,
  created_at: "2027-01-01T10:00:00+00:00",
  ...overrides,
}) as any;

const delivery = (overrides: Record<string, unknown> = {}) => ({
  id: "delivery-1",
  realtime_version: 1,
  sender_user_id: "customer-1",
  courier_user_id: "courier-1",
  status: "COURIER_TO_PICKUP",
  pickup_address: "Joina City, Harare",
  dropoff_address: "Borrowdale, Harare",
  recipient_name: "Tariro",
  recipient_phone: "+263770000001",
  package_type: "parcel",
  live_tracking_active: true,
  ...overrides,
}) as any;

const earnings = (total = 0) => ({
  currency: "USD",
  completed_deliveries: total ? 1 : 0,
  total_payout_usd: total,
  today_payout_usd: total,
  last_7_days_payout_usd: total,
  month_payout_usd: total,
  latest_payouts: [],
  periods: {
    today: { accrued_earnings_usd: total, completed_deliveries: total ? 1 : 0, online_minutes: 10 },
    week: { accrued_earnings_usd: total, completed_deliveries: total ? 1 : 0, online_minutes: 10 },
    month: { accrued_earnings_usd: total, completed_deliveries: total ? 1 : 0, online_minutes: 10 },
  },
  weekly_chart: [], settlement_integrated: false, payout_history: [],
}) as any;

const snapshot = (overrides: Record<string, unknown> = {}) => ({
  profile: profile(), active_delivery: null, earnings: earnings(), offers: [offer()], next_shift: null, ...overrides,
}) as any;

const realtime = (
  type: string,
  resourceType: string,
  resourceId: string,
  version: number,
  payload: Record<string, unknown>,
): RealtimeEventEnvelope => ({
  event_id: `${type}-${resourceId}-${version}`,
  type,
  resource_type: resourceType,
  resource_id: resourceId,
  version,
  occurred_at: "2027-01-01T10:01:00+00:00",
  payload,
});

const offerEvent = (type: string, item: ReturnType<typeof offer>) => realtime(
  type,
  "courier_offer",
  item.id,
  item.realtime_version,
  type === "courier_offer.removed" ? { id: item.id, realtime_version: item.realtime_version } : item,
);

const wrapper = ({ children }: PropsWithChildren) => <CourierWorkspaceProvider>{children}</CourierWorkspaceProvider>;

describe("Courier Home and Offers realtime workspace", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListener = null;
    mockRevision = 0;
    (getCourierWorkspace as jest.Mock).mockResolvedValue(snapshot());
    (getActiveCourierDelivery as jest.Mock).mockResolvedValue(delivery());
    (getCourierEarnings as jest.Mock).mockResolvedValue(earnings(5));
    (listCourierOffers as jest.Mock).mockResolvedValue([offer("offer-fresh", 4)]);
  });

  it("loads one aggregate snapshot and has no 12-second screen timer", async () => {
    renderHook(() => useCourierWorkspace(), { wrapper });
    await waitFor(() => expect(getCourierWorkspace).toHaveBeenCalledTimes(1));
    const home = fs.readFileSync(path.join(__dirname, "../app/(courier)/home.tsx"), "utf8");
    const offers = fs.readFileSync(path.join(__dirname, "../app/(courier)/offers.tsx"), "utf8");
    expect(home).not.toContain("useLiveRefresh");
    expect(offers).not.toContain("useLiveRefresh");
    expect(home).not.toContain("12000");
    expect(offers).not.toContain("12000");
    expect(offers).not.toContain("await load()");
  });

  it("adds offers by ID, ignores duplicates/stale events, and removes safely", async () => {
    const view = renderHook(() => useCourierWorkspace(), { wrapper });
    await waitFor(() => expect(view.result.current.offers).toHaveLength(1));
    const second = offer("offer-2", 1);
    act(() => mockListener?.(offerEvent("courier_offer.available", second)));
    expect(view.result.current.offers.map((item) => item.id)).toEqual(["offer-1", "offer-2"]);
    act(() => mockListener?.(offerEvent("courier_offer.available", second)));
    expect(view.result.current.offers).toHaveLength(2);
    act(() => mockListener?.(offerEvent("courier_offer.updated", offer("offer-2", 0, { courier_payout_usd: 9 }))));
    expect(view.result.current.offers[1].courier_payout_usd).toBe(5);
    act(() => mockListener?.(offerEvent("courier_offer.removed", offer("offer-2", 2))));
    expect(view.result.current.offers.map((item) => item.id)).toEqual(["offer-1"]);
    expect(selectedCourierOfferId(view.result.current.offers, "offer-2")).toBe("offer-1");
  });

  it("performs one targeted offer reconciliation for a known version gap", async () => {
    const view = renderHook(() => useCourierWorkspace(), { wrapper });
    await waitFor(() => expect(view.result.current.offers).toHaveLength(1));
    act(() => mockListener?.(offerEvent("courier_offer.updated", offer("offer-1", 3, { courier_payout_usd: 8 }))));
    await waitFor(() => expect(listCourierOffers).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(view.result.current.offers[0]?.id).toBe("offer-fresh"));
    expect(getCourierWorkspace).toHaveBeenCalledTimes(1);
  });

  it("discovers an Admin assignment once and clears discovery offers", async () => {
    const view = renderHook(() => useCourierWorkspace(), { wrapper });
    await waitFor(() => expect(view.result.current.offers).toHaveLength(1));
    act(() => mockListener?.(realtime(
      "courier_delivery.status_changed", "courier_delivery", "delivery-1", 1,
      { courier_user_id: "courier-1", status: "COURIER_TO_PICKUP", realtime_version: 1 },
    )));
    await waitFor(() => expect(getActiveCourierDelivery).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(view.result.current.active?.id).toBe("delivery-1"));
    expect(view.result.current.offers).toEqual([]);
  });

  it("applies active delivery state and terminal refreshes earnings/offers once", async () => {
    (getCourierWorkspace as jest.Mock).mockResolvedValue(snapshot({ active_delivery: delivery(), offers: [] }));
    const view = renderHook(() => useCourierWorkspace(), { wrapper });
    await waitFor(() => expect(view.result.current.active?.id).toBe("delivery-1"));
    act(() => mockListener?.(realtime(
      "courier_delivery.status_changed", "courier_delivery", "delivery-1", 2,
      { status: "IN_TRANSIT", live_tracking_active: true, realtime_version: 2 },
    )));
    expect(view.result.current.active?.status).toBe("IN_TRANSIT");
    act(() => mockListener?.(realtime(
      "courier_delivery.terminal", "courier_delivery", "delivery-1", 3,
      { status: "DELIVERED", live_tracking_active: false, realtime_version: 3 },
    )));
    await waitFor(() => expect(view.result.current.active).toBeNull());
    await waitFor(() => expect(getCourierEarnings).toHaveBeenCalledTimes(1));
    expect(listCourierOffers).toHaveBeenCalledTimes(1);
    expect(view.result.current.earnings?.total_payout_usd).toBe(5);
  });

  it("applies online/offline changes locally without a full workspace reload", async () => {
    const view = renderHook(() => useCourierWorkspace(), { wrapper });
    await waitFor(() => expect(view.result.current.offers).toHaveLength(1));
    await act(async () => view.result.current.applyOnlineProfile(profile({ online: false })));
    expect(view.result.current.offers).toEqual([]);
    expect(getCourierWorkspace).toHaveBeenCalledTimes(1);
    expect(getCourierEarnings).toHaveBeenCalledTimes(1);
    await act(async () => view.result.current.applyOnlineProfile(profile({ online: true })));
    expect(listCourierOffers).toHaveBeenCalledTimes(1);
    expect(getCourierWorkspace).toHaveBeenCalledTimes(1);
  });

  it("reconciles once after realtime resume and applies claim state without reload", async () => {
    const view = renderHook(() => useCourierWorkspace(), { wrapper });
    await waitFor(() => expect(getCourierWorkspace).toHaveBeenCalledTimes(1));
    mockRevision = 1;
    view.rerender(undefined);
    await waitFor(() => expect(getCourierWorkspace).toHaveBeenCalledTimes(2));
    act(() => view.result.current.acceptClaimedDelivery(delivery({ id: "claimed" })));
    expect(view.result.current.active?.id).toBe("claimed");
    expect(view.result.current.offers).toEqual([]);
    expect(getCourierWorkspace).toHaveBeenCalledTimes(2);
  });
});
