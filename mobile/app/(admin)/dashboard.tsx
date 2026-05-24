import { useCallback, useMemo, useRef, useState } from "react";
import { Alert, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { EmptyState } from "../../components/states/EmptyState";
import { ErrorState } from "../../components/states/ErrorState";
import { LoadingState } from "../../components/states/LoadingState";
import { AppButton } from "../../components/ui/AppButton";
import { AppInput } from "../../components/ui/AppInput";
import { ListTile } from "../../components/ui/ListTile";
import { Screen } from "../../components/ui/Screen";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { colors } from "../../constants/colors";
import { spacing } from "../../constants/spacing";
import { useLiveRefresh } from "../../hooks/useLiveRefresh";
import {
  AdminActivity,
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
import { logout } from "../../services/authService";
import { disableBiometricLogin } from "../../services/biometricService";
import { AdminVerificationListItem, VerificationStatus } from "../../types/verification.types";
import { formatStatus } from "../../utils/formatStatus";

type AdminSection =
  | "overview"
  | "users"
  | "rides"
  | "requests"
  | "verifications"
  | "support"
  | "reports"
  | "operations"
  | "actions";

type ReasonAction = {
  title: string;
  message: string;
  confirmLabel: string;
  reasonLabel: string;
  onConfirm: (reason: string) => Promise<void>;
};

const sections: Array<{ key: AdminSection; label: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }> = [
  { key: "overview", label: "Overview", icon: "view-dashboard-outline" },
  { key: "users", label: "Users", icon: "account-group-outline" },
  { key: "rides", label: "Rides", icon: "car-outline" },
  { key: "requests", label: "Bookings", icon: "ticket-confirmation-outline" },
  { key: "verifications", label: "Verifications", icon: "shield-check-outline" },
  { key: "support", label: "Support", icon: "lifebuoy" },
  { key: "reports", label: "Safety", icon: "shield-alert-outline" },
  { key: "operations", label: "Ops log", icon: "clipboard-text-clock-outline" },
  { key: "actions", label: "Actions", icon: "cog-outline" },
];

const requestFilters = ["all", "pending", "confirmed", "declined", "cancelled_by_passenger", "cancelled_by_driver", "cancelled_by_admin"];
const verificationFilters: Array<"all" | VerificationStatus> = ["all", "pending", "needs_review", "verified", "rejected"];
const supportFilters = ["all", "received", "open", "in_review", "resolved", "closed"];
const reportFilters = ["all", "submitted", "open", "in_review", "resolved", "dismissed"];
const rideFilters = ["all", "open", "closed", "cancelled", "pending_requests", "full"];
const userFilters = ["all", "passenger", "driver", "admin", "verified", "unverified", "suspended"];

export default function AdminDashboardScreen() {
  const router = useRouter();
  const [active, setActive] = useState<AdminSection>("overview");
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [rides, setRides] = useState<AdminRide[]>([]);
  const [requests, setRequests] = useState<AdminRequest[]>([]);
  const [verifications, setVerifications] = useState<AdminVerificationListItem[]>([]);
  const [support, setSupport] = useState<AdminSupportMessage[]>([]);
  const [reports, setReports] = useState<AdminSafetyReport[]>([]);
  const [auditLogs, setAuditLogs] = useState<AdminAuditLog[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [expandedId, setExpandedId] = useState("");
  const [reasonAction, setReasonAction] = useState<ReasonAction | null>(null);
  const [reason, setReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const hasLoaded = useRef(false);

  const load = useCallback(async () => {
    try {
      if (!hasLoaded.current) setLoading(true);
      else setRefreshing(true);
      setError("");
      const [overviewData, usersData, ridesData, requestsData, verificationData, supportData, reportData, auditData] = await Promise.all([
        getAdminOverview(),
        listAdminUsers(),
        listAdminRides(),
        listAdminRequests(),
        listAdminVerifications(),
        listAdminSupportMessages(),
        listAdminReports(),
        listAdminAuditLogs(),
      ]);
      setOverview(overviewData);
      setUsers(usersData.items);
      setRides(ridesData.items);
      setRequests(requestsData.items);
      setVerifications(verificationData.items);
      setSupport(supportData.items);
      setReports(reportData.items);
      setAuditLogs(auditData.items);
      hasLoaded.current = true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load admin dashboard.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useLiveRefresh(load, 45000);

  function switchSection(nextSection: AdminSection) {
    setActive(nextSection);
    setSearch("");
    setFilter("all");
    setExpandedId("");
  }

  async function handleLogout() {
    await disableBiometricLogin();
    await logout();
    router.replace("/(auth)/welcome" as never);
  }

  async function runReasonAction() {
    if (!reasonAction || !reason.trim()) return;
    try {
      setActionLoading(true);
      await reasonAction.onConfirm(reason.trim());
      setReasonAction(null);
      setReason("");
      await load();
    } catch (err) {
      Alert.alert("Admin action failed", err instanceof Error ? err.message : "Could not complete the admin action.");
    } finally {
      setActionLoading(false);
    }
  }

  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      if (!matchesSearch(user, search, ["name", "email", "phone", "city", "role", "status"])) return false;
      if (filter === "all") return true;
      if (filter === "verified") return user.driver_verification_status === "verified" || user.verification_status === "verified";
      if (filter === "unverified") return (user.driver_verification_status || user.verification_status || "not_started") !== "verified";
      if (filter === "suspended") return user.status === "suspended";
      return user.role === filter;
    });
  }, [filter, search, users]);

  const filteredRides = useMemo(() => {
    return rides.filter((ride) => {
      if (!matchesSearch(ride, search, ["origin", "destination", "driver_name", "vehicle", "date", "status"])) return false;
      if (filter === "all") return true;
      if (filter === "pending_requests") return Number(ride.pending_request_count || 0) > 0;
      if (filter === "full") return Number(ride.available_seats || 0) === 0;
      return ride.status === filter;
    });
  }, [filter, rides, search]);

  const filteredRequests = useMemo(() => {
    return requests.filter((request) => {
      if (!matchesSearch({ ...request, route: routeLabel(request) }, search, ["passenger_name", "passenger_email", "driver_name", "driver_email", "route", "status"])) return false;
      return filter === "all" || request.status === filter;
    });
  }, [filter, requests, search]);

  const filteredVerifications = useMemo(() => {
    return verifications.filter((item) => {
      if (!matchesSearch(item, search, ["name", "email", "phone", "city", "verification_status"])) return false;
      return filter === "all" || item.verification_status === filter;
    });
  }, [filter, search, verifications]);

  const filteredSupport = useMemo(() => {
    return support.filter((message) => {
      if (!matchesSearch(message, search, ["subject", "message", "user_name", "user_email", "status"])) return false;
      return filter === "all" || message.status === filter;
    });
  }, [filter, search, support]);

  const filteredReports = useMemo(() => {
    return reports.filter((report) => {
      if (!matchesSearch(report, search, ["report_type", "message", "user_name", "user_email", "status"])) return false;
      return filter === "all" || report.status === filter;
    });
  }, [filter, reports, search]);
  const adminError = getAdminErrorCopy(error);
  const blockingError = Boolean(error && !overview);
  const canRenderSection = !loading && !blockingError;

  return (
    <Screen title="Admin" showNotifications={false}>
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

      <View style={styles.hero}>
        <StatusBadge label="Operations command center" tone="neutral" />
        <Text style={styles.title}>LetsGoRide admin</Text>
        <Text style={styles.body}>Monitor users, rides, bookings, verification, support, safety reports, and admin actions.</Text>
        {refreshing ? <Text style={styles.refreshing}>Refreshing operational data...</Text> : null}
      </View>

      <View style={styles.navGrid}>
        {sections.map((section) => (
          <Pressable
            key={section.key}
            accessibilityRole="button"
            accessibilityLabel={section.label}
            onPress={() => switchSection(section.key)}
            style={({ pressed }) => [styles.navPill, active === section.key && styles.navPillActive, pressed && styles.pressed]}
          >
            <MaterialCommunityIcons name={section.icon} size={16} color={active === section.key ? colors.card : colors.mutedText} />
            <Text style={[styles.navText, active === section.key && styles.navTextActive]}>{section.label}</Text>
          </Pressable>
        ))}
      </View>

      {loading ? <LoadingState label="Loading admin operations..." /> : null}
      {blockingError ? <ErrorState title={adminError.title} message={adminError.body} onRetry={load} /> : null}
      {error && overview ? (
        <View style={styles.inlineError}>
          <Text style={styles.inlineErrorTitle}>{adminError.title}</Text>
          <Text style={styles.body}>{adminError.body}</Text>
          <AppButton title="Retry refresh" variant="secondary" onPress={load} />
        </View>
      ) : null}

      {canRenderSection && active === "overview" ? (
        <>
          <SectionTitle title="Operational summary" />
          <MetricGrid overview={overview} />
          <SectionTitle title="Quick actions" />
          <QuickActions onSelect={switchSection} />
          <SectionTitle title="Recent activity" />
          <RecentActivity items={overview?.recent_activity || []} />
        </>
      ) : null}

      {canRenderSection && active === "users" ? (
        <AdminList title="Users" search={search} setSearch={setSearch} filters={userFilters} activeFilter={filter} setFilter={setFilter}>
          {filteredUsers.length === 0 ? <EmptyState title="No users found" body="Try a different search or filter." /> : null}
          {filteredUsers.map((user) => (
            <AdminUserCard
              key={user.id}
              user={user}
              expanded={expandedId === user.id}
              onToggle={() => setExpandedId(expandedId === user.id ? "" : user.id)}
              onSuspend={() =>
                setReasonAction({
                  title: "Suspend user",
                  message: `Suspend ${user.name || "this user"}? This should only be used for safety or support reasons.`,
                  reasonLabel: "Reason for suspension",
                  confirmLabel: "Suspend user",
                  onConfirm: (actionReason) => updateAdminUserStatus(user.id, "suspended", actionReason).then(() => undefined),
                })
              }
              onReactivate={() => updateAdminUserStatus(user.id, "active").then(load)}
            />
          ))}
        </AdminList>
      ) : null}

      {canRenderSection && active === "rides" ? (
        <AdminList title="Rides" search={search} setSearch={setSearch} filters={rideFilters} activeFilter={filter} setFilter={setFilter}>
          {filteredRides.length === 0 ? <EmptyState title="No rides found" body="No rides match this operational filter." /> : null}
          {filteredRides.map((ride) => (
            <AdminRideCard
              key={ride.id}
              ride={ride}
              expanded={expandedId === ride.id}
              onToggle={() => setExpandedId(expandedId === ride.id ? "" : ride.id)}
              onClose={() => updateAdminRideStatus(ride.id, "closed").then(load)}
              onReopen={() => updateAdminRideStatus(ride.id, "open").then(load)}
              onCancel={() =>
                setReasonAction({
                  title: "Cancel ride",
                  message: `Cancel ${ride.origin} to ${ride.destination} for safety or support reasons?`,
                  reasonLabel: "Reason for cancellation",
                  confirmLabel: "Cancel ride",
                  onConfirm: (actionReason) => updateAdminRideStatus(ride.id, "cancelled", actionReason).then(() => undefined),
                })
              }
            />
          ))}
        </AdminList>
      ) : null}

      {canRenderSection && active === "requests" ? (
        <AdminList title="Bookings and requests" search={search} setSearch={setSearch} filters={requestFilters} activeFilter={filter} setFilter={setFilter}>
          {filteredRequests.length === 0 ? <EmptyState title="No ride requests" body="Driver approvals and passenger bookings will appear here." /> : null}
          {filteredRequests.map((request) => (
            <AdminRequestCard
              key={request.id}
              request={request}
              expanded={expandedId === request.id}
              onToggle={() => setExpandedId(expandedId === request.id ? "" : request.id)}
              onCancel={() =>
                setReasonAction({
                  title: "Cancel booking for safety",
                  message: "Admin cancellation is an override for support or safety cases only.",
                  reasonLabel: "Reason for admin cancellation",
                  confirmLabel: "Cancel booking",
                  onConfirm: (actionReason) => updateAdminRequestStatus(request.id, "cancelled_by_admin", actionReason).then(() => undefined),
                })
              }
            />
          ))}
        </AdminList>
      ) : null}

      {canRenderSection && active === "verifications" ? (
        <AdminList title="Driver verifications" search={search} setSearch={setSearch} filters={verificationFilters} activeFilter={filter} setFilter={setFilter}>
          {filteredVerifications.length === 0 ? <EmptyState title="No pending verifications" body="Driver submissions will appear here when they need review." /> : null}
          {filteredVerifications.map((item) => (
            <VerificationCard key={item.driver_id} item={item} onReview={() => router.push(`/(admin)/verification/${item.driver_id}` as never)} />
          ))}
        </AdminList>
      ) : null}

      {canRenderSection && active === "support" ? (
        <AdminList title="Support cases" search={search} setSearch={setSearch} filters={supportFilters} activeFilter={filter} setFilter={setFilter}>
          {filteredSupport.length === 0 ? <EmptyState title="No support cases" body="New user support messages will appear here." /> : null}
          {filteredSupport.map((message) => (
            <SupportCard
              key={message.id}
              message={message}
              expanded={expandedId === message.id}
              onToggle={() => setExpandedId(expandedId === message.id ? "" : message.id)}
              onStatus={(status) => updateAdminSupportStatus(message.id, status).then(load)}
            />
          ))}
        </AdminList>
      ) : null}

      {canRenderSection && active === "reports" ? (
        <AdminList title="Safety reports" search={search} setSearch={setSearch} filters={reportFilters} activeFilter={filter} setFilter={setFilter}>
          {filteredReports.length === 0 ? <EmptyState title="No safety reports" body="Submitted reports will appear here for review." /> : null}
          {filteredReports.map((report) => (
            <ReportCard
              key={report.id}
              report={report}
              expanded={expandedId === report.id}
              onToggle={() => setExpandedId(expandedId === report.id ? "" : report.id)}
              onStatus={(status) => updateAdminReportStatus(report.id, status).then(load)}
            />
          ))}
        </AdminList>
      ) : null}

      {canRenderSection && active === "operations" ? (
        <View style={styles.section}>
          <SectionTitle title="Operations log" subtitle="Admin actions, verification decisions, booking interventions, support, and safety updates." />
          {auditLogs.length === 0 ? <EmptyState title="No operations yet" body="Admin actions will appear here after operational changes are made." /> : null}
          {auditLogs.map((log) => (
            <View key={log.id} style={styles.card}>
              <StatusBadge label={formatStatus(log.action)} tone="neutral" />
              <Text style={styles.cardTitle}>{formatStatus(log.target_type)} - {log.target_id}</Text>
              <Text style={styles.body}>{formatDate(log.created_at)} by {log.actor_role || "system"}</Text>
              {log.metadata ? <Text style={styles.detailText}>{JSON.stringify(log.metadata)}</Text> : null}
            </View>
          ))}
        </View>
      ) : null}

      {canRenderSection && active === "actions" ? (
        <View style={styles.section}>
          <SectionTitle title="Account actions" />
          <ListTile icon="refresh" title="Refresh data" subtitle="Reload admin dashboard records" onPress={load} />
          <ListTile icon="shield-check-outline" title="Review verifications" subtitle="Open the driver verification queue" onPress={() => switchSection("verifications")} />
          <ListTile icon="logout" title="Logout" subtitle="Sign out of the admin account" danger onPress={handleLogout} />
        </View>
      ) : null}
    </Screen>
  );
}

function AdminList({
  title,
  search,
  setSearch,
  filters,
  activeFilter,
  setFilter,
  children,
}: {
  title: string;
  search: string;
  setSearch: (value: string) => void;
  filters: string[];
  activeFilter: string;
  setFilter: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <SectionTitle title={title} />
      <AppInput label="Search" value={search} onChangeText={setSearch} leftIcon="magnify" placeholder="Search by route, name, email, phone, city, or status" />
      <FilterChips filters={filters} active={activeFilter} onSelect={setFilter} />
      {children}
    </View>
  );
}

function MetricGrid({ overview }: { overview: AdminOverview | null }) {
  if (!overview) return <EmptyState title="No overview data" body="Admin summary will appear here once data loads." />;
  const metrics = [
    ["Total users", overview.total_users ?? overview.users],
    ["Verified drivers", overview.verified_drivers],
    ["Pending verifications", overview.pending_driver_verifications ?? overview.pending_verifications],
    ["Active rides", overview.active_rides ?? overview.rides],
    ["Pending requests", overview.pending_ride_requests],
    ["Confirmed bookings", overview.confirmed_bookings],
    ["Open support", overview.open_support_cases],
    ["Open safety reports", overview.open_safety_reports],
    ["Unread admin notices", overview.unread_admin_notifications],
  ];
  return (
    <View style={styles.metricGrid}>
      {metrics.map(([label, value]) => (
        <View key={String(label)} style={styles.metric}>
          <Text style={styles.metricValue}>{Number(value || 0)}</Text>
          <Text style={styles.metricLabel}>{label}</Text>
        </View>
      ))}
    </View>
  );
}

function QuickActions({ onSelect }: { onSelect: (section: AdminSection) => void }) {
  const actions: Array<{ title: string; subtitle: string; icon: keyof typeof MaterialCommunityIcons.glyphMap; section: AdminSection }> = [
    { title: "Review verifications", subtitle: "Approve, reject, or request more driver information", icon: "shield-check-outline", section: "verifications" },
    { title: "View ride requests", subtitle: "Monitor bookings without taking over driver approval", icon: "ticket-confirmation-outline", section: "requests" },
    { title: "Open support cases", subtitle: "Review user support and operational messages", icon: "lifebuoy", section: "support" },
    { title: "Review safety reports", subtitle: "Investigate submitted safety concerns", icon: "shield-alert-outline", section: "reports" },
    { title: "View users", subtitle: "Search passengers, drivers, and admin accounts", icon: "account-search-outline", section: "users" },
    { title: "View rides", subtitle: "Inspect active, full, closed, and cancelled rides", icon: "car-search-outline", section: "rides" },
  ];
  return (
    <View style={styles.section}>
      {actions.map((action) => (
        <ListTile key={action.title} icon={action.icon} title={action.title} subtitle={action.subtitle} onPress={() => onSelect(action.section)} />
      ))}
    </View>
  );
}

function RecentActivity({ items }: { items: AdminActivity[] }) {
  if (items.length === 0) {
    return <EmptyState title="No recent activity" body="Ride requests, verifications, support, and safety reports will appear here." />;
  }
  return (
    <View style={styles.section}>
      {items.map((item) => (
        <View key={item.id} style={styles.activityCard}>
          <StatusBadge label={formatStatus(item.status || item.type)} tone={tone(item.status)} />
          <Text style={styles.cardTitle}>{item.title}</Text>
          <Text style={styles.body}>{item.subtitle}</Text>
          <Text style={styles.metaText}>{formatDate(item.created_at)}</Text>
        </View>
      ))}
    </View>
  );
}

function AdminUserCard({
  user,
  expanded,
  onToggle,
  onSuspend,
  onReactivate,
}: {
  user: AdminUser;
  expanded: boolean;
  onToggle: () => void;
  onSuspend: () => void;
  onReactivate: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onToggle} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={styles.cardHeader}>
        <StatusBadge label={formatStatus(user.role)} tone={user.role === "admin" ? "neutral" : "success"} />
        <StatusBadge label={formatStatus(user.status || "active")} tone={tone(user.status || "active")} />
      </View>
      <Text style={styles.cardTitle}>{user.name || "Unnamed user"}</Text>
      <Text style={styles.body}>{user.email || "No email"} - {user.city || "No city"}</Text>
      <Text style={styles.body}>Phone: {user.phone || "Not added"}</Text>
      <Text style={styles.body}>Identity: {formatStatus(user.driver_verification_status || user.verification_status || "not_started")}</Text>
      {expanded ? (
        <View style={styles.detailBlock}>
          <DetailLine label="Posted rides" value={user.posted_rides_count} />
          <DetailLine label="Ride requests" value={user.ride_requests_count} />
          <DetailLine label="Confirmed bookings" value={user.confirmed_bookings_count} />
          <DetailLine label="Support cases" value={user.support_cases_count} />
          <DetailLine label="Safety reports" value={user.safety_reports_count} />
          <View style={styles.actionRow}>
            {user.status === "suspended" ? (
              <AppButton title="Reactivate" variant="secondary" onPress={onReactivate} style={styles.compactButton} />
            ) : (
              <AppButton title="Suspend user" variant="danger" onPress={onSuspend} style={styles.compactButton} />
            )}
          </View>
        </View>
      ) : null}
    </Pressable>
  );
}

function AdminRideCard({
  ride,
  expanded,
  onToggle,
  onClose,
  onReopen,
  onCancel,
}: {
  ride: AdminRide;
  expanded: boolean;
  onToggle: () => void;
  onClose: () => void;
  onReopen: () => void;
  onCancel: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onToggle} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={styles.cardHeader}>
        <StatusBadge label={formatStatus(ride.status)} tone={tone(ride.status)} />
        {Number(ride.pending_request_count || 0) > 0 ? <StatusBadge label={`${ride.pending_request_count} pending`} tone="warning" /> : null}
      </View>
      <Text style={styles.cardTitle}>{ride.origin} to {ride.destination}</Text>
      <Text style={styles.body}>{ride.date} at {ride.time} - US${ride.price_usd} - {ride.available_seats} seats available</Text>
      <Text style={styles.body}>{ride.driver_name} - {ride.vehicle}</Text>
      {expanded ? (
        <View style={styles.detailBlock}>
          <DetailLine label="Requests" value={ride.request_count} />
          <DetailLine label="Confirmed bookings" value={ride.confirmed_booking_count} />
          <DetailLine label="Conversations" value={ride.conversation_count} />
          <DetailLine label="Driver phone" value={ride.driver_phone || "Not added"} />
          <DetailLine label="Driver email" value={ride.driver_email || "Not added"} />
          <View style={styles.actionRow}>
            {ride.status === "open" ? <AppButton title="Close ride" variant="secondary" onPress={onClose} style={styles.compactButton} /> : null}
            {ride.status !== "open" ? <AppButton title="Reopen" variant="secondary" onPress={onReopen} style={styles.compactButton} /> : null}
            {ride.status !== "cancelled" ? <AppButton title="Cancel for safety" variant="danger" onPress={onCancel} style={styles.compactButton} /> : null}
          </View>
        </View>
      ) : null}
    </Pressable>
  );
}

function AdminRequestCard({
  request,
  expanded,
  onToggle,
  onCancel,
}: {
  request: AdminRequest;
  expanded: boolean;
  onToggle: () => void;
  onCancel: () => void;
}) {
  const active = request.status === "pending" || request.status === "confirmed";
  return (
    <Pressable accessibilityRole="button" onPress={onToggle} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <StatusBadge label={formatStatus(request.status)} tone={tone(request.status)} />
      <Text style={styles.cardTitle}>{request.passenger_name || "Passenger"}</Text>
      <Text style={styles.body}>{routeLabel(request)} - {request.seats} {request.seats === 1 ? "seat" : "seats"}</Text>
      <Text style={styles.body}>Driver: {request.driver_name || request.ride?.driver_name || "Driver"}</Text>
      {expanded ? (
        <View style={styles.detailBlock}>
          <DetailLine label="Passenger phone" value={request.passenger_phone || "Not shared"} />
          <DetailLine label="Passenger email" value={request.passenger_email || "Not available"} />
          <DetailLine label="Driver phone" value={request.driver_phone || "Not available"} />
          <DetailLine label="Conversations" value={request.conversation_count} />
          <Text style={styles.helperText}>Admin monitors requests. Drivers approve or decline normal passenger requests.</Text>
          {active ? <AppButton title="Cancel for safety" variant="danger" onPress={onCancel} /> : null}
        </View>
      ) : null}
    </Pressable>
  );
}

function VerificationCard({ item, onReview }: { item: AdminVerificationListItem; onReview: () => void }) {
  return (
    <View style={styles.card}>
      <StatusBadge label={formatStatus(item.verification_status)} tone={tone(item.verification_status)} />
      <Text style={styles.cardTitle}>{item.name || "Driver"}</Text>
      <Text style={styles.body}>{item.phone || item.email || "No contact on file"} - {item.city || "City not set"}</Text>
      <Text style={styles.body}>{item.document_count} submitted documents</Text>
      <AppButton title="Review submission" variant="secondary" onPress={onReview} />
    </View>
  );
}

function SupportCard({
  message,
  expanded,
  onToggle,
  onStatus,
}: {
  message: AdminSupportMessage;
  expanded: boolean;
  onToggle: () => void;
  onStatus: (status: "received" | "open" | "in_review" | "resolved" | "closed") => void;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onToggle} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <StatusBadge label={formatStatus(message.status)} tone={tone(message.status)} />
      <Text style={styles.cardTitle}>{message.subject || "Support case"}</Text>
      <Text numberOfLines={expanded ? undefined : 2} style={styles.body}>{message.user_name || message.user_email || "User"} - {message.message}</Text>
      {expanded ? (
        <View style={styles.actionRow}>
          <AppButton title="In review" variant="secondary" onPress={() => onStatus("in_review")} style={styles.compactButton} />
          <AppButton title="Resolved" onPress={() => onStatus("resolved")} style={styles.compactButton} />
          <AppButton title="Close" variant="ghost" onPress={() => onStatus("closed")} style={styles.compactButton} />
        </View>
      ) : null}
    </Pressable>
  );
}

function ReportCard({
  report,
  expanded,
  onToggle,
  onStatus,
}: {
  report: AdminSafetyReport;
  expanded: boolean;
  onToggle: () => void;
  onStatus: (status: "submitted" | "open" | "in_review" | "resolved" | "dismissed") => void;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onToggle} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <StatusBadge label={formatStatus(report.status)} tone={tone(report.status)} />
      <Text style={styles.cardTitle}>{formatStatus(report.report_type)}</Text>
      <Text numberOfLines={expanded ? undefined : 2} style={styles.body}>{report.user_name || report.user_email || "Reporter"} - {report.message}</Text>
      {expanded ? (
        <View style={styles.detailBlock}>
          <Text style={styles.helperText}>Safety reports should be reviewed carefully before changing status.</Text>
          <View style={styles.actionRow}>
            <AppButton title="In review" variant="secondary" onPress={() => onStatus("in_review")} style={styles.compactButton} />
            <AppButton title="Resolved" onPress={() => onStatus("resolved")} style={styles.compactButton} />
            <AppButton title="Dismiss" variant="ghost" onPress={() => onStatus("dismissed")} style={styles.compactButton} />
          </View>
        </View>
      ) : null}
    </Pressable>
  );
}

function ReasonModal({
  action,
  reason,
  loading,
  onChangeReason,
  onCancel,
  onConfirm,
}: {
  action: ReasonAction | null;
  reason: string;
  loading: boolean;
  onChangeReason: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal visible={Boolean(action)} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>{action?.title}</Text>
          <Text style={styles.body}>{action?.message}</Text>
          <AppInput label={action?.reasonLabel || "Reason"} value={reason} onChangeText={onChangeReason} multiline />
          <AppButton title={action?.confirmLabel || "Confirm"} variant="danger" loading={loading} disabled={!reason.trim()} onPress={onConfirm} />
          <AppButton title="Cancel" variant="ghost" disabled={loading} onPress={onCancel} />
        </View>
      </View>
    </Modal>
  );
}

function FilterChips({ filters, active, onSelect }: { filters: string[]; active: string; onSelect: (filter: string) => void }) {
  return (
    <View style={styles.filterWrap}>
      {filters.map((filterValue) => (
        <Pressable
          key={filterValue}
          accessibilityRole="button"
          onPress={() => onSelect(filterValue)}
          style={({ pressed }) => [styles.filterChip, active === filterValue && styles.filterChipActive, pressed && styles.pressed]}
        >
          <Text style={[styles.filterText, active === filterValue && styles.filterTextActive]}>{formatStatus(filterValue)}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.sectionTitleBlock}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle ? <Text style={styles.body}>{subtitle}</Text> : null}
    </View>
  );
}

function DetailLine({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <View style={styles.detailLine}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value ?? 0}</Text>
    </View>
  );
}

function matchesSearch(row: Record<string, unknown>, search: string, fields: string[]) {
  if (!search.trim()) return true;
  const term = search.trim().toLowerCase();
  return fields.some((field) => String(row[field] || "").toLowerCase().includes(term));
}

function routeLabel(request: AdminRequest) {
  const snapshot = request.ride_snapshot || request.ride;
  return `${snapshot?.origin || "Ride"} to ${snapshot?.destination || "destination"}`;
}

function tone(status?: string): "success" | "warning" | "danger" | "neutral" {
  if (status && ["verified", "confirmed", "resolved", "active", "open"].includes(status)) return "success";
  if (status && ["rejected", "cancelled", "cancelled_by_admin", "cancelled_by_driver", "cancelled_by_passenger", "suspended", "deleted", "dismissed"].includes(status)) return "danger";
  if (status && ["pending", "needs_review", "submitted", "received", "in_review", "declined", "closed"].includes(status)) return "warning";
  return "neutral";
}

function formatDate(value?: string) {
  if (!value) return "No timestamp";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function getAdminErrorCopy(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes("session expired") || normalized.includes("log in again") || normalized.includes("401")) {
    return {
      title: "Admin session expired",
      body: "Please log in again to continue.",
    };
  }
  if (normalized.includes("admin access") || normalized.includes("permission") || normalized.includes("403")) {
    return {
      title: "Admin access required",
      body: "This section is only available to authorized admin users.",
    };
  }
  return {
    title: "Connection issue",
    body: "We could not load the latest admin data. Check your connection or try again.",
  };
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: colors.card,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    gap: spacing.md,
    shadowColor: colors.black,
    shadowOpacity: 0.05,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  title: {
    color: colors.whiteText,
    fontSize: 32,
    fontWeight: "900",
  },
  body: {
    color: colors.mutedText,
    lineHeight: 21,
  },
  refreshing: {
    color: colors.primaryGreen,
    fontWeight: "800",
    fontSize: 12,
  },
  inlineError: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,176,32,0.32)",
    backgroundColor: "#FFF8E6",
  },
  inlineErrorTitle: {
    color: colors.whiteText,
    fontSize: 16,
    fontWeight: "900",
  },
  navGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  navPill: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.md,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  navPillActive: {
    backgroundColor: colors.primaryGreen,
    borderColor: colors.primaryGreen,
  },
  navText: {
    color: colors.mutedText,
    fontWeight: "900",
    fontSize: 12,
  },
  navTextActive: {
    color: colors.card,
  },
  section: {
    gap: spacing.md,
  },
  sectionTitleBlock: {
    gap: 4,
  },
  sectionTitle: {
    color: colors.whiteText,
    fontSize: 20,
    fontWeight: "900",
  },
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  metric: {
    width: "47%",
    minHeight: 112,
    justifyContent: "center",
    backgroundColor: colors.elevated,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  metricValue: {
    color: colors.primaryGreen,
    fontSize: 30,
    fontWeight: "900",
  },
  metricLabel: {
    color: colors.mutedText,
    fontWeight: "800",
    marginTop: 4,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  activityCard: {
    backgroundColor: colors.elevated,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  cardHeader: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  cardTitle: {
    color: colors.whiteText,
    fontSize: 18,
    fontWeight: "900",
  },
  filterWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  filterChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  filterChipActive: {
    backgroundColor: "rgba(17,139,68,0.12)",
    borderColor: "rgba(17,139,68,0.36)",
  },
  filterText: {
    color: colors.mutedText,
    fontWeight: "800",
    fontSize: 12,
  },
  filterTextActive: {
    color: colors.primaryGreen,
  },
  detailBlock: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  detailLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  detailLabel: {
    color: colors.mutedText,
    fontWeight: "700",
    flex: 1,
  },
  detailValue: {
    color: colors.whiteText,
    fontWeight: "900",
    flexShrink: 1,
    textAlign: "right",
  },
  detailText: {
    color: colors.mutedText,
    fontSize: 12,
    lineHeight: 18,
  },
  helperText: {
    color: colors.mutedText,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
  },
  metaText: {
    color: colors.mutedText,
    fontSize: 12,
    fontWeight: "800",
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  compactButton: {
    minHeight: 44,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: "center",
    padding: spacing.xl,
    backgroundColor: "rgba(17,20,23,0.28)",
  },
  modalCard: {
    padding: spacing.xl,
    gap: spacing.md,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  modalTitle: {
    color: colors.whiteText,
    fontSize: 24,
    fontWeight: "900",
  },
  pressed: {
    transform: [{ scale: 0.99 }],
  },
});
