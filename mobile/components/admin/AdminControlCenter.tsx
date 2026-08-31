import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";

import { EmptyState } from "../states/EmptyState";
import { ErrorState } from "../states/ErrorState";
import { LoadingState } from "../states/LoadingState";
import { AppButton } from "../ui/AppButton";
import { AppInput } from "../ui/AppInput";
import { Screen } from "../ui/Screen";
import { StatusBadge } from "../ui/StatusBadge";
import { colors } from "../../constants/colors";
import { spacing } from "../../constants/spacing";
import { useRealtime } from "../../contexts/RealtimeContext";
import { useScreenReconciliation } from "../../hooks/useScreenReconciliation";
import {
  AdminAuditLog,
  AdminOverview,
  AdminRequest,
  AdminRide,
  AdminSafetyReport,
  AdminSupportMessage,
  AdminUser,
  getAdminOverview,
  listAdminAuditLogs,
  listAdminReports,
  listAdminRequests,
  listAdminRides,
  listAdminSupportMessages,
  listAdminUsers,
  listAdminVerifications,
  updateAdminReportStatus,
  updateAdminRequestStatus,
  updateAdminRideStatus,
  updateAdminSupportStatus,
  updateAdminUserStatus,
} from "../../services/adminService";
import { logoutToGuest } from "../../services/authService";
import { AdminVerificationListItem } from "../../types/verification.types";
import { formatStatus } from "../../utils/formatStatus";
import { canonicalRideStatus, tripStatusLabel, tripStatusTone } from "../../utils/tripLifecycle";

const ADMIN_CONNECTED_RECONCILIATION_MS = 15000;
const ADMIN_RECOVERY_RECONCILIATION_MS = 8000;

const VERIFIED_DRIVER_STATUSES = new Set(["approved", "verified", "active"]);
const PENDING_DRIVER_STATUSES = new Set([
  "pending",
  "pending_uploads",
  "pending_auto_check",
  "needs_review",
  "needs_resubmission",
]);

const ADMIN_EVENT_RESOURCES = new Set([
  "user",
  "driver",
  "verification",
  "ride",
  "ride_request",
  "hailing_trip",
  "courier_delivery",
  "food_order",
  "support_message",
  "safety_report",
  "worker_application",
  "notification",
]);

type AdminSection = "overview" | "verifications" | "support" | "safety" | "bookings" | "users" | "rides" | "audit";

type ReasonAction = {
  title: string;
  message: string;
  confirmLabel: string;
  reasonLabel: string;
  onConfirm: (reason: string) => Promise<void>;
};

export default function AdminControlCenter() {
  const router = useRouter();
  const { connectionState, reconciliationRevision, subscribe, reconnect } = useRealtime();
  const [active, setActive] = useState<AdminSection>("overview");
  const activeRef = useRef<AdminSection>("overview");
  activeRef.current = active;

  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [verifications, setVerifications] = useState<AdminVerificationListItem[]>([]);
  const [support, setSupport] = useState<AdminSupportMessage[]>([]);
  const [reports, setReports] = useState<AdminSafetyReport[]>([]);
  const [requests, setRequests] = useState<AdminRequest[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [rides, setRides] = useState<AdminRide[]>([]);
  const [auditLogs, setAuditLogs] = useState<AdminAuditLog[]>([]);

  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [sectionLoading, setSectionLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [reasonAction, setReasonAction] = useState<ReasonAction | null>(null);
  const [reason, setReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const hasLoaded = useRef(false);
  const coreInFlight = useRef<Promise<void> | null>(null);
  const sectionInFlight = useRef<Promise<void> | null>(null);
  const seenRevision = useRef(reconciliationRevision);

  const loadCore = useCallback(() => {
    if (coreInFlight.current) return coreInFlight.current;
    if (!hasLoaded.current) setLoading(true);
    else setRefreshing(true);
    setError("");

    let request!: Promise<void>;
    request = Promise.all([getAdminOverview(), listAdminVerifications()])
      .then(([overviewData, verificationData]) => {
        const approvedCount = verificationData.items.filter((item) => VERIFIED_DRIVER_STATUSES.has(String(item.verification_status))).length;
        const pendingCount = verificationData.items.filter((item) => PENDING_DRIVER_STATUSES.has(String(item.verification_status))).length;
        setVerifications(verificationData.items);
        // Keep the dashboard internally consistent even while an older backend is still deployed.
        setOverview({
          ...overviewData,
          verified_drivers: approvedCount,
          pending_verifications: pendingCount,
          pending_driver_verifications: pendingCount,
        });
        hasLoaded.current = true;
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Unable to load current admin operations.");
      })
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
        if (coreInFlight.current === request) coreInFlight.current = null;
      });
    coreInFlight.current = request;
    return request;
  }, []);

  const loadSection = useCallback((section: AdminSection) => {
    if (section === "overview" || section === "verifications") return Promise.resolve();
    if (sectionInFlight.current) return sectionInFlight.current;
    setSectionLoading(true);

    let request!: Promise<void>;
    request = (async () => {
      if (section === "support") setSupport((await listAdminSupportMessages()).items);
      else if (section === "safety") setReports((await listAdminReports()).items);
      else if (section === "bookings") setRequests((await listAdminRequests()).items);
      else if (section === "users") setUsers((await listAdminUsers()).items);
      else if (section === "rides") setRides((await listAdminRides()).items);
      else if (section === "audit") setAuditLogs((await listAdminAuditLogs()).items);
    })()
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to refresh this admin section."))
      .finally(() => {
        setSectionLoading(false);
        if (sectionInFlight.current === request) sectionInFlight.current = null;
      });
    sectionInFlight.current = request;
    return request;
  }, []);

  const refreshVisible = useCallback(async () => {
    await loadCore();
    await loadSection(activeRef.current);
  }, [loadCore, loadSection]);

  useScreenReconciliation(refreshVisible);

  useEffect(() => subscribe((event) => {
    if (!ADMIN_EVENT_RESOURCES.has(String(event.resource_type))) return;
    void refreshVisible();
  }), [refreshVisible, subscribe]);

  useEffect(() => {
    if (seenRevision.current === reconciliationRevision) return;
    seenRevision.current = reconciliationRevision;
    void refreshVisible();
  }, [reconciliationRevision, refreshVisible]);

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const schedule = () => {
      const delay = connectionState === "connected" ? ADMIN_CONNECTED_RECONCILIATION_MS : ADMIN_RECOVERY_RECONCILIATION_MS;
      timer = setTimeout(async () => {
        await refreshVisible();
        if (!cancelled) schedule();
      }, delay);
    };

    schedule();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [connectionState, refreshVisible]));

  const switchSection = useCallback((section: AdminSection) => {
    setActive(section);
    setSearch("");
    void loadSection(section);
  }, [loadSection]);

  const refreshAfterMutation = useCallback(async () => {
    await refreshVisible();
  }, [refreshVisible]);

  async function runReasonAction() {
    if (!reasonAction || !reason.trim()) return;
    try {
      setActionLoading(true);
      await reasonAction.onConfirm(reason.trim());
      setReasonAction(null);
      setReason("");
      await refreshAfterMutation();
    } catch (err) {
      Alert.alert("Admin action failed", err instanceof Error ? err.message : "Could not complete the admin action.");
    } finally {
      setActionLoading(false);
    }
  }

  const pendingVerifications = useMemo(
    () => verifications.filter((item) => PENDING_DRIVER_STATUSES.has(String(item.verification_status))),
    [verifications],
  );

  const searchedVerifications = useMemo(
    () => filterSearch(verifications, search, ["name", "email", "phone", "city", "verification_status"]),
    [search, verifications],
  );
  const searchedSupport = useMemo(() => filterSearch(support, search, ["subject", "message", "user_name", "user_email", "status"]), [search, support]);
  const searchedReports = useMemo(() => filterSearch(reports, search, ["report_type", "message", "user_name", "user_email", "status"]), [reports, search]);
  const searchedRequests = useMemo(() => filterSearch(requests, search, ["passenger_name", "passenger_email", "driver_name", "driver_email", "status"]), [requests, search]);
  const searchedUsers = useMemo(() => filterSearch(users, search, ["name", "email", "phone", "city", "role", "status"]), [search, users]);
  const searchedRides = useMemo(() => filterSearch(rides, search, ["origin", "destination", "driver_name", "vehicle", "status"]), [rides, search]);
  const searchedAudit = useMemo(() => filterSearch(auditLogs, search, ["action", "target_type", "target_id", "actor_role"]), [auditLogs, search]);

  const live = connectionState === "connected";
  const adminError = errorCopy(error);

  return (
    <Screen title="Operations" showNotifications={false} refreshing={refreshing} onRefresh={refreshVisible}>
      <ReasonModal
        action={reasonAction}
        reason={reason}
        loading={actionLoading}
        onChangeReason={setReason}
        onCancel={() => {
          setReasonAction(null);
          setReason("");
        }}
        onConfirm={runReasonAction}
      />

      {active === "overview" ? (
        <View style={styles.hero}>
          <View style={styles.heroTopRow}>
            <View style={styles.livePill}>
              <View style={[styles.liveDot, !live && styles.liveDotOffline]} />
              <Text style={styles.liveText}>{live ? "LIVE" : "RECONNECTING"}</Text>
            </View>
            {!live ? (
              <Pressable accessibilityRole="button" onPress={reconnect} style={styles.reconnectButton}>
                <MaterialCommunityIcons name="refresh" size={18} color="#FFFFFF" />
                <Text style={styles.reconnectText}>Reconnect</Text>
              </Pressable>
            ) : null}
          </View>
          <Text style={styles.heroEyebrow}>LETSGORIDE CONTROL CENTER</Text>
          <Text style={styles.heroTitle}>Run the platform.</Text>
          <Text style={styles.heroBody}>Approvals, safety, users and live operations in one place. Data reconciles while this screen is open.</Text>
        </View>
      ) : (
        <SectionHeader title={sectionTitle(active)} onBack={() => switchSection("overview")} live={live} />
      )}

      {loading ? <LoadingState label="Loading live operations…" /> : null}
      {error && !overview ? <ErrorState title={adminError.title} message={adminError.body} onRetry={refreshVisible} /> : null}
      {error && overview ? (
        <View style={styles.warningCard}>
          <MaterialCommunityIcons name="alert-circle-outline" size={22} color="#8A5A00" />
          <View style={styles.warningCopy}>
            <Text style={styles.warningTitle}>{adminError.title}</Text>
            <Text style={styles.muted}>{adminError.body}</Text>
          </View>
          <AppButton title="Retry" variant="secondary" onPress={refreshVisible} />
        </View>
      ) : null}

      {!loading && overview && active === "overview" ? (
        <Overview
          overview={overview}
          pendingVerifications={pendingVerifications.length}
          onOpen={switchSection}
          onOpenWorkforce={() => router.push("/(admin)/workforce" as never)}
          onOpenHailing={() => router.push("/(admin)/hailing" as never)}
          onOpenSettlements={() => router.push("/(admin)/settlements" as never)}
          onLogout={() => logoutToGuest(router)}
        />
      ) : null}

      {!loading && overview && active !== "overview" ? (
        <View style={styles.section}>
          {active !== "audit" ? <AppInput label="Search" value={search} onChangeText={setSearch} placeholder={`Search ${sectionTitle(active).toLowerCase()}`} /> : <AppInput label="Search operations log" value={search} onChangeText={setSearch} />}
          {sectionLoading ? <LoadingState label={`Refreshing ${sectionTitle(active).toLowerCase()}…`} /> : null}

          {active === "verifications" ? (
            <VerificationList items={searchedVerifications} onReview={(driverId) => router.push(`/(admin)/verification/${driverId}` as never)} />
          ) : null}

          {active === "support" ? (
            <SupportList
              items={searchedSupport}
              onStatus={async (id, status) => {
                const updated = await updateAdminSupportStatus(id, status);
                setSupport((current) => current.map((item) => (item.id === updated.id ? updated : item)));
                await loadCore();
              }}
            />
          ) : null}

          {active === "safety" ? (
            <SafetyList
              items={searchedReports}
              onStatus={async (id, status) => {
                const updated = await updateAdminReportStatus(id, status);
                setReports((current) => current.map((item) => (item.id === updated.id ? updated : item)));
                await loadCore();
              }}
            />
          ) : null}

          {active === "bookings" ? (
            <BookingList
              items={searchedRequests}
              onCancel={(request) => setReasonAction({
                title: "Cancel booking",
                message: "Use the admin override only for a real safety or support reason.",
                reasonLabel: "Reason for cancellation",
                confirmLabel: "Cancel booking",
                onConfirm: async (actionReason) => {
                  const updated = await updateAdminRequestStatus(request.id, "cancelled_by_admin", actionReason);
                  setRequests((current) => current.map((item) => (item.id === updated.id ? updated : item)));
                },
              })}
            />
          ) : null}

          {active === "users" ? (
            <UserList
              items={searchedUsers}
              onSuspend={(user) => setReasonAction({
                title: "Suspend user",
                message: `Suspend ${user.name || user.email || "this account"}?`,
                reasonLabel: "Reason for suspension",
                confirmLabel: "Suspend user",
                onConfirm: async (actionReason) => {
                  const updated = await updateAdminUserStatus(user.id, "suspended", actionReason);
                  setUsers((current) => current.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)));
                },
              })}
              onReactivate={async (user) => {
                const updated = await updateAdminUserStatus(user.id, "active");
                setUsers((current) => current.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)));
                await loadCore();
              }}
            />
          ) : null}

          {active === "rides" ? (
            <RideList
              items={searchedRides}
              onClose={async (ride) => {
                const updated = await updateAdminRideStatus(ride.id, "closed");
                setRides((current) => current.map((item) => (item.id === updated.id ? updated : item)));
                await loadCore();
              }}
              onReopen={async (ride) => {
                const updated = await updateAdminRideStatus(ride.id, "open");
                setRides((current) => current.map((item) => (item.id === updated.id ? updated : item)));
                await loadCore();
              }}
              onCancel={(ride) => setReasonAction({
                title: "Cancel ride",
                message: `Cancel ${ride.origin || "this ride"} to ${ride.destination || "its destination"}?`,
                reasonLabel: "Reason for cancellation",
                confirmLabel: "Cancel ride",
                onConfirm: async (actionReason) => {
                  const updated = await updateAdminRideStatus(ride.id, "cancelled", actionReason);
                  setRides((current) => current.map((item) => (item.id === updated.id ? updated : item)));
                },
              })}
            />
          ) : null}

          {active === "audit" ? <AuditList items={searchedAudit} /> : null}
        </View>
      ) : null}
    </Screen>
  );
}

function Overview({
  overview,
  pendingVerifications,
  onOpen,
  onOpenWorkforce,
  onOpenHailing,
  onOpenSettlements,
  onLogout,
}: {
  overview: AdminOverview;
  pendingVerifications: number;
  onOpen: (section: AdminSection) => void;
  onOpenWorkforce: () => void;
  onOpenHailing: () => void;
  onOpenSettlements: () => void;
  onLogout: () => void;
}) {
  return (
    <>
      <View style={styles.metricGrid}>
        <Metric value={overview.total_users ?? overview.users ?? 0} label="Users" />
        <Metric value={overview.verified_drivers || 0} label="Approved drivers" />
        <Metric value={pendingVerifications} label="Pending checks" urgent={pendingVerifications > 0} />
        <Metric value={overview.active_rides || 0} label="Active rides" />
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeadingRow}>
          <View>
            <Text style={styles.sectionEyebrow}>PRIORITY QUEUE</Text>
            <Text style={styles.sectionTitle}>Needs attention</Text>
          </View>
          <Text style={styles.sectionHint}>Tap to manage</Text>
        </View>
        <AttentionRow icon="shield-account-outline" title="Driver verification" subtitle="Review identity and vehicle documents" count={pendingVerifications} onPress={() => onOpen("verifications")} />
        <AttentionRow icon="shield-alert-outline" title="Safety" subtitle="Open passenger and driver reports" count={overview.open_safety_reports || 0} onPress={() => onOpen("safety")} danger />
        <AttentionRow icon="lifebuoy" title="Support" subtitle="Cases waiting for an admin" count={overview.open_support_cases || 0} onPress={() => onOpen("support")} />
        <AttentionRow icon="ticket-confirmation-outline" title="Bookings" subtitle="Pending booking requests" count={overview.pending_ride_requests || 0} onPress={() => onOpen("bookings")} />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionEyebrow}>MANAGE</Text>
        <Text style={styles.sectionTitle}>Platform controls</Text>
        <View style={styles.manageGrid}>
          <ManageCard icon="account-group-outline" title="Users" subtitle="Accounts & access" onPress={() => onOpen("users")} />
          <ManageCard icon="car-outline" title="Rides" subtitle="Scheduled operations" onPress={() => onOpen("rides")} />
          <ManageCard icon="car-connected" title="Ride Now" subtitle="Cities & eligibility" onPress={onOpenHailing} />
          <ManageCard icon="calendar-account-outline" title="Workforce" subtitle="Workers & shifts" onPress={onOpenWorkforce} />
          <ManageCard icon="cash-sync" title="Settlements" subtitle="Weekly driver fees" onPress={onOpenSettlements} />
          <ManageCard icon="clipboard-text-clock-outline" title="Audit log" subtitle="Admin history" onPress={() => onOpen("audit")} />
          <ManageCard icon="logout" title="Sign out" subtitle="End admin session" onPress={onLogout} danger />
        </View>
      </View>

      {overview.recent_activity?.length ? (
        <View style={styles.section}>
          <Text style={styles.sectionEyebrow}>LATEST</Text>
          <Text style={styles.sectionTitle}>Recent activity</Text>
          {overview.recent_activity.slice(0, 5).map((item) => (
            <View key={item.id} style={styles.activityRow}>
              <View style={styles.activityIcon}><MaterialCommunityIcons name="pulse" size={18} color={colors.charcoal} /></View>
              <View style={styles.activityCopy}>
                <Text style={styles.rowTitle}>{item.title}</Text>
                <Text style={styles.muted} numberOfLines={1}>{item.subtitle}</Text>
              </View>
              {item.status ? <StatusBadge label={formatStatus(item.status)} tone={statusTone(item.status)} /> : null}
            </View>
          ))}
        </View>
      ) : null}
    </>
  );
}

function VerificationList({ items, onReview }: { items: AdminVerificationListItem[]; onReview: (driverId: string) => void }) {
  if (!items.length) return <EmptyState title="No driver submissions" body="New verification requests will appear here automatically." />;
  const sorted = [...items].sort((a, b) => Number(PENDING_DRIVER_STATUSES.has(String(b.verification_status))) - Number(PENDING_DRIVER_STATUSES.has(String(a.verification_status))));
  return (
    <View style={styles.list}>
      {sorted.map((item) => (
        <Pressable key={item.driver_id} accessibilityRole="button" onPress={() => onReview(item.driver_id)} style={({ pressed }) => [styles.recordCard, pressed && styles.pressed]}>
          <View style={styles.recordTopRow}>
            <StatusBadge label={formatStatus(item.verification_status)} tone={statusTone(item.verification_status)} />
            <MaterialCommunityIcons name="chevron-right" size={24} color={colors.mutedText} />
          </View>
          <Text style={styles.recordTitle}>{item.name || "Driver applicant"}</Text>
          <Text style={styles.muted}>{item.email || item.phone || "No contact on file"}</Text>
          <View style={styles.recordMetaRow}>
            <Text style={styles.recordMeta}>{item.city || "City not set"}</Text>
            <Text style={styles.recordMeta}>{item.document_count} documents</Text>
          </View>
          <View style={styles.primaryAction}><Text style={styles.primaryActionText}>Review now</Text></View>
        </Pressable>
      ))}
    </View>
  );
}

function SupportList({ items, onStatus }: { items: AdminSupportMessage[]; onStatus: (id: string, status: "received" | "open" | "in_review" | "resolved" | "closed") => Promise<void> }) {
  if (!items.length) return <EmptyState title="No support cases" body="Support messages will appear here." />;
  return <View style={styles.list}>{items.map((item) => (
    <View key={item.id} style={styles.recordCard}>
      <StatusBadge label={formatStatus(item.status)} tone={statusTone(item.status)} />
      <Text style={styles.recordTitle}>{item.subject || "Support case"}</Text>
      <Text style={styles.muted}>{item.user_name || item.user_email || "User"}</Text>
      <Text style={styles.recordBody}>{item.message}</Text>
      <View style={styles.actionRow}>
        <AppButton title="Review" variant="secondary" onPress={() => onStatus(item.id, "in_review")} style={styles.flexButton} />
        <AppButton title="Resolve" onPress={() => onStatus(item.id, "resolved")} style={styles.flexButton} />
      </View>
      <AppButton title="Close case" variant="ghost" onPress={() => onStatus(item.id, "closed")} />
    </View>
  ))}</View>;
}

function SafetyList({ items, onStatus }: { items: AdminSafetyReport[]; onStatus: (id: string, status: "submitted" | "open" | "in_review" | "resolved" | "dismissed") => Promise<void> }) {
  if (!items.length) return <EmptyState title="No safety reports" body="Submitted safety reports will appear here." />;
  return <View style={styles.list}>{items.map((item) => (
    <View key={item.id} style={styles.recordCard}>
      <StatusBadge label={formatStatus(item.status)} tone={statusTone(item.status)} />
      <Text style={styles.recordTitle}>{formatStatus(item.report_type)}</Text>
      <Text style={styles.muted}>{item.user_name || item.user_email || "Reporter"}</Text>
      <Text style={styles.recordBody}>{item.message}</Text>
      <View style={styles.actionRow}>
        <AppButton title="Investigate" variant="secondary" onPress={() => onStatus(item.id, "in_review")} style={styles.flexButton} />
        <AppButton title="Resolve" onPress={() => onStatus(item.id, "resolved")} style={styles.flexButton} />
      </View>
      <AppButton title="Dismiss" variant="ghost" onPress={() => onStatus(item.id, "dismissed")} />
    </View>
  ))}</View>;
}

function BookingList({ items, onCancel }: { items: AdminRequest[]; onCancel: (request: AdminRequest) => void }) {
  if (!items.length) return <EmptyState title="No bookings" body="Passenger bookings and requests will appear here." />;
  return <View style={styles.list}>{items.map((item) => (
    <View key={item.id} style={styles.recordCard}>
      <StatusBadge label={formatStatus(item.status)} tone={statusTone(item.status)} />
      <Text style={styles.recordTitle}>{item.passenger_name || "Passenger"}</Text>
      <Text style={styles.muted}>{routeLabel(item)}</Text>
      <Text style={styles.recordBody}>Driver: {item.driver_name || item.ride?.driver_name || "Not assigned"}</Text>
      {item.status === "pending" || item.status === "confirmed" ? <AppButton title="Cancel for safety" variant="danger" onPress={() => onCancel(item)} /> : null}
    </View>
  ))}</View>;
}

function UserList({ items, onSuspend, onReactivate }: { items: AdminUser[]; onSuspend: (user: AdminUser) => void; onReactivate: (user: AdminUser) => Promise<void> }) {
  if (!items.length) return <EmptyState title="No users found" body="Try another search." />;
  return <View style={styles.list}>{items.map((item) => (
    <View key={item.id} style={styles.recordCard}>
      <View style={styles.recordTopRow}>
        <StatusBadge label={formatStatus(item.status || "active")} tone={statusTone(item.status)} />
        <Text style={styles.roleText}>{formatStatus(item.role)}</Text>
      </View>
      <Text style={styles.recordTitle}>{item.name || item.email || "User"}</Text>
      <Text style={styles.muted}>{item.email || item.phone || "No contact"}</Text>
      {item.status === "suspended" ? <AppButton title="Reactivate" onPress={() => onReactivate(item)} /> : item.role !== "admin" ? <AppButton title="Suspend" variant="danger" onPress={() => onSuspend(item)} /> : null}
    </View>
  ))}</View>;
}

function RideList({ items, onClose, onReopen, onCancel }: { items: AdminRide[]; onClose: (ride: AdminRide) => Promise<void>; onReopen: (ride: AdminRide) => Promise<void>; onCancel: (ride: AdminRide) => void }) {
  if (!items.length) return <EmptyState title="No rides found" body="Scheduled ride operations will appear here." />;
  return <View style={styles.list}>{items.map((item) => {
    const canonical = canonicalRideStatus(item.status);
    const activeRide = !["COMPLETED", "CANCELLED", "EXPIRED"].includes(canonical);
    return (
      <View key={item.id} style={styles.recordCard}>
        <StatusBadge label={tripStatusLabel(item.status)} tone={tripStatusTone(item.status)} />
        <Text style={styles.recordTitle}>{item.origin || "Origin"} → {item.destination || "Destination"}</Text>
        <Text style={styles.muted}>{item.driver_name || "Driver"}</Text>
        <Text style={styles.recordBody}>{item.pending_request_count || 0} pending requests · {item.available_seats ?? 0} seats available</Text>
        {activeRide ? (
          <View style={styles.actionRow}>
            <AppButton title="Close" variant="secondary" onPress={() => onClose(item)} style={styles.flexButton} />
            <AppButton title="Cancel" variant="danger" onPress={() => onCancel(item)} style={styles.flexButton} />
          </View>
        ) : canonical !== "CANCELLED" ? <AppButton title="Reopen" variant="secondary" onPress={() => onReopen(item)} /> : null}
      </View>
    );
  })}</View>;
}

function AuditList({ items }: { items: AdminAuditLog[] }) {
  if (!items.length) return <EmptyState title="No admin history" body="Administrative actions will be recorded here." />;
  return <View style={styles.list}>{items.map((item) => (
    <View key={item.id} style={styles.auditRow}>
      <View style={styles.activityIcon}><MaterialCommunityIcons name="history" size={18} color={colors.charcoal} /></View>
      <View style={styles.activityCopy}>
        <Text style={styles.rowTitle}>{formatStatus(item.action)}</Text>
        <Text style={styles.muted}>{formatStatus(item.target_type)} · {item.target_id}</Text>
      </View>
    </View>
  ))}</View>;
}

function SectionHeader({ title, onBack, live }: { title: string; onBack: () => void; live: boolean }) {
  return (
    <View style={styles.sectionHeader}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back to admin overview" onPress={onBack} style={styles.backButton}>
        <MaterialCommunityIcons name="arrow-left" size={22} color={colors.charcoal} />
      </Pressable>
      <View style={styles.sectionHeaderCopy}>
        <Text style={styles.sectionEyebrow}>ADMIN</Text>
        <Text style={styles.sectionHeaderTitle}>{title}</Text>
      </View>
      <View style={styles.smallLive}><View style={[styles.liveDot, !live && styles.liveDotOffline]} /><Text style={styles.smallLiveText}>{live ? "Live" : "Syncing"}</Text></View>
    </View>
  );
}

function Metric({ value, label, urgent = false }: { value: number; label: string; urgent?: boolean }) {
  return (
    <View style={[styles.metric, urgent && styles.metricUrgent]}>
      <Text style={[styles.metricValue, urgent && styles.metricValueUrgent]}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function AttentionRow({ icon, title, subtitle, count, onPress, danger = false }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; title: string; subtitle: string; count: number; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.attentionRow, pressed && styles.pressed]}>
      <View style={[styles.attentionIcon, danger && styles.attentionIconDanger]}><MaterialCommunityIcons name={icon} size={22} color={danger ? "#A43131" : colors.charcoal} /></View>
      <View style={styles.activityCopy}><Text style={styles.rowTitle}>{title}</Text><Text style={styles.muted}>{subtitle}</Text></View>
      <View style={[styles.countBadge, count > 0 && styles.countBadgeActive]}><Text style={[styles.countText, count > 0 && styles.countTextActive]}>{count}</Text></View>
      <MaterialCommunityIcons name="chevron-right" size={22} color={colors.mutedText} />
    </Pressable>
  );
}

function ManageCard({ icon, title, subtitle, onPress, danger = false }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; title: string; subtitle: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.manageCard, pressed && styles.pressed]}>
      <MaterialCommunityIcons name={icon} size={26} color={danger ? "#A43131" : colors.charcoal} />
      <Text style={[styles.manageTitle, danger && styles.dangerText]}>{title}</Text>
      <Text style={styles.muted}>{subtitle}</Text>
    </Pressable>
  );
}

function ReasonModal({ action, reason, loading, onChangeReason, onCancel, onConfirm }: { action: ReasonAction | null; reason: string; loading: boolean; onChangeReason: (value: string) => void; onCancel: () => void; onConfirm: () => void }) {
  return (
    <Modal visible={Boolean(action)} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>{action?.title}</Text>
          <Text style={styles.recordBody}>{action?.message}</Text>
          <AppInput label={action?.reasonLabel || "Reason"} value={reason} onChangeText={onChangeReason} multiline />
          <AppButton title={action?.confirmLabel || "Confirm"} variant="danger" loading={loading} disabled={!reason.trim()} onPress={onConfirm} />
          <AppButton title="Cancel" variant="ghost" disabled={loading} onPress={onCancel} />
        </View>
      </View>
    </Modal>
  );
}

function sectionTitle(section: AdminSection) {
  const labels: Record<AdminSection, string> = {
    overview: "Operations",
    verifications: "Driver verification",
    support: "Support",
    safety: "Safety",
    bookings: "Bookings",
    users: "Users",
    rides: "Rides",
    audit: "Audit log",
  };
  return labels[section];
}

function filterSearch<T extends Record<string, unknown>>(rows: T[], search: string, fields: string[]) {
  const term = search.trim().toLowerCase();
  if (!term) return rows;
  return rows.filter((row) => fields.some((field) => String(row[field] ?? "").toLowerCase().includes(term)));
}

function statusTone(status?: string): "success" | "warning" | "danger" | "neutral" {
  const value = String(status || "").toLowerCase();
  if (["approved", "verified", "active", "confirmed", "resolved", "completed", "open"].includes(value)) return "success";
  if (["rejected", "cancelled", "cancelled_by_admin", "cancelled_by_driver", "cancelled_by_passenger", "suspended", "deleted", "dismissed"].includes(value)) return "danger";
  if (["pending", "pending_uploads", "pending_auto_check", "needs_review", "needs_resubmission", "submitted", "received", "in_review", "declined", "closed"].includes(value)) return "warning";
  return "neutral";
}

function routeLabel(request: AdminRequest) {
  const snapshot = request.ride_snapshot || request.ride;
  return `${snapshot?.origin || "Ride"} → ${snapshot?.destination || "destination"}`;
}

function errorCopy(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes("session expired") || normalized.includes("401")) return { title: "Admin session expired", body: "Log in again to continue." };
  if (normalized.includes("admin access") || normalized.includes("403")) return { title: "Admin access required", body: "This account does not currently have admin access." };
  return { title: "Admin sync issue", body: "The latest operations data could not be loaded. Existing data is kept on screen while we reconnect." };
}

const styles = StyleSheet.create({
  hero: { backgroundColor: colors.charcoal, borderRadius: 30, padding: spacing.xl, gap: spacing.md },
  heroTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  livePill: { flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: "rgba(255,255,255,0.1)", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#4ADE80" },
  liveDotOffline: { backgroundColor: "#FBBF24" },
  liveText: { color: "#FFFFFF", fontWeight: "900", fontSize: 11, letterSpacing: 1.2 },
  reconnectButton: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 40, paddingHorizontal: 12 },
  reconnectText: { color: "#FFFFFF", fontWeight: "800", fontSize: 12 },
  heroEyebrow: { color: "#86EFAC", fontWeight: "900", fontSize: 11, letterSpacing: 1.8 },
  heroTitle: { color: "#FFFFFF", fontSize: 34, lineHeight: 39, fontWeight: "900" },
  heroBody: { color: "#D1D5DB", lineHeight: 22 },
  metricGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  metric: { width: "48%", minHeight: 116, justifyContent: "space-between", backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 24, padding: spacing.lg },
  metricUrgent: { backgroundColor: "#FFF8E6", borderColor: "#F4D58A" },
  metricValue: { color: colors.charcoal, fontSize: 34, fontWeight: "900" },
  metricValueUrgent: { color: "#8A5A00" },
  metricLabel: { color: colors.mutedText, fontWeight: "800", fontSize: 13 },
  section: { gap: spacing.md },
  sectionHeadingRow: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" },
  sectionEyebrow: { color: colors.primaryGreen, fontWeight: "900", fontSize: 11, letterSpacing: 1.5 },
  sectionTitle: { color: colors.charcoal, fontSize: 24, fontWeight: "900", marginTop: 3 },
  sectionHint: { color: colors.mutedText, fontSize: 12, fontWeight: "700" },
  attentionRow: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 86, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 22, padding: spacing.md },
  attentionIcon: { width: 46, height: 46, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: colors.mutedSurface },
  attentionIconDanger: { backgroundColor: "#FDECEC" },
  countBadge: { minWidth: 31, height: 31, paddingHorizontal: 8, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: colors.mutedSurface },
  countBadgeActive: { backgroundColor: colors.charcoal },
  countText: { color: colors.mutedText, fontWeight: "900" },
  countTextActive: { color: "#FFFFFF" },
  manageGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  manageCard: { width: "48%", minHeight: 132, gap: 8, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 22, padding: spacing.lg },
  manageTitle: { color: colors.charcoal, fontWeight: "900", fontSize: 17 },
  dangerText: { color: "#A43131" },
  activityRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  activityIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: colors.mutedSurface, alignItems: "center", justifyContent: "center" },
  activityCopy: { flex: 1, gap: 3 },
  rowTitle: { color: colors.charcoal, fontWeight: "900", fontSize: 15 },
  muted: { color: colors.mutedText, lineHeight: 19, fontSize: 13 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 24, padding: spacing.md },
  backButton: { width: 46, height: 46, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: colors.mutedSurface },
  sectionHeaderCopy: { flex: 1 },
  sectionHeaderTitle: { color: colors.charcoal, fontSize: 22, fontWeight: "900" },
  smallLive: { flexDirection: "row", alignItems: "center", gap: 6 },
  smallLiveText: { color: colors.mutedText, fontSize: 11, fontWeight: "800" },
  warningCard: { flexDirection: "row", alignItems: "center", gap: 10, padding: spacing.md, borderRadius: 20, backgroundColor: "#FFF8E6", borderWidth: 1, borderColor: "#F4D58A" },
  warningCopy: { flex: 1 },
  warningTitle: { color: "#704A00", fontWeight: "900" },
  list: { gap: spacing.md },
  recordCard: { gap: spacing.sm, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 24, padding: spacing.lg },
  recordTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  recordTitle: { color: colors.charcoal, fontSize: 20, fontWeight: "900" },
  recordBody: { color: colors.charcoal, lineHeight: 21 },
  recordMetaRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  recordMeta: { color: colors.mutedText, fontSize: 12, fontWeight: "800", backgroundColor: colors.mutedSurface, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 6 },
  primaryAction: { marginTop: 4, minHeight: 48, borderRadius: 16, backgroundColor: colors.charcoal, alignItems: "center", justifyContent: "center" },
  primaryActionText: { color: "#FFFFFF", fontWeight: "900" },
  actionRow: { flexDirection: "row", gap: spacing.sm },
  flexButton: { flex: 1 },
  roleText: { color: colors.mutedText, fontWeight: "900", fontSize: 12, textTransform: "uppercase" },
  auditRow: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 18, padding: spacing.md },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(5,6,7,0.56)", justifyContent: "center", padding: spacing.xl },
  modalCard: { gap: spacing.md, backgroundColor: colors.card, borderRadius: 26, padding: spacing.xl },
  modalTitle: { color: colors.charcoal, fontSize: 23, fontWeight: "900" },
  pressed: { opacity: 0.72 },
});
