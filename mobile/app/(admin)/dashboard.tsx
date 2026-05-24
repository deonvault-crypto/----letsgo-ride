import { useCallback, useState } from "react";
import { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { EmptyState } from "../../components/states/EmptyState";
import { ErrorState } from "../../components/states/ErrorState";
import { LoadingState } from "../../components/states/LoadingState";
import { AppButton } from "../../components/ui/AppButton";
import { ListTile } from "../../components/ui/ListTile";
import { Screen } from "../../components/ui/Screen";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { colors } from "../../constants/colors";
import { spacing } from "../../constants/spacing";
import { useLiveRefresh } from "../../hooks/useLiveRefresh";
import {
  AdminOverview,
  AdminSafetyReport,
  AdminSupportMessage,
  getAdminOverview,
  listAdminReports,
  listAdminRequests,
  listAdminRides,
  listAdminSupportMessages,
  listAdminUsers,
  listAdminVerifications,
  updateAdminRequestStatus,
  updateAdminReportStatus,
  updateAdminRideStatus,
  updateAdminSupportStatus,
  updateAdminUserStatus,
} from "../../services/adminService";
import { logout } from "../../services/authService";
import { Ride, RideRequest } from "../../types/ride.types";
import { User } from "../../types/user.types";
import { AdminVerificationListItem } from "../../types/verification.types";
import { formatStatus } from "../../utils/formatStatus";

type AdminSection =
  | "overview"
  | "users"
  | "rides"
  | "requests"
  | "verifications"
  | "support"
  | "reports"
  | "actions";

export default function AdminDashboardScreen() {
  const router = useRouter();
  const [active, setActive] = useState<AdminSection>("overview");
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [rides, setRides] = useState<Ride[]>([]);
  const [requests, setRequests] = useState<RideRequest[]>([]);
  const [verifications, setVerifications] = useState<AdminVerificationListItem[]>([]);
  const [support, setSupport] = useState<AdminSupportMessage[]>([]);
  const [reports, setReports] = useState<AdminSafetyReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const [
        overviewData,
        usersData,
        ridesData,
        requestsData,
        verificationData,
        supportData,
        reportData,
      ] = await Promise.all([
        getAdminOverview(),
        listAdminUsers(),
        listAdminRides(),
        listAdminRequests(),
        listAdminVerifications(),
        listAdminSupportMessages(),
        listAdminReports(),
      ]);
      setOverview(overviewData);
      setUsers(usersData);
      setRides(ridesData);
      setRequests(requestsData);
      setVerifications(verificationData.items);
      setSupport(supportData);
      setReports(reportData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load admin dashboard.");
    } finally {
      setLoading(false);
    }
  }, []);

  useLiveRefresh(load, 15000);

  async function handleLogout() {
    await logout();
    router.replace("/(auth)/welcome" as never);
  }

  return (
    <Screen title="Admin" showNotifications={false}>
      <View style={styles.hero}>
        <StatusBadge label="Admin" tone="neutral" />
        <Text style={styles.title}>Admin dashboard</Text>
        <Text style={styles.body}>Review LetsGoRide users, trips, verification, support, and safety activity.</Text>
      </View>
      <View style={styles.navGrid}>
        {adminSections.map((section) => (
          <AppButton
            key={section.key}
            title={section.label}
            variant={active === section.key ? "primary" : "secondary"}
            onPress={() => setActive(section.key)}
            style={styles.navButton}
          />
        ))}
      </View>

      {loading ? <LoadingState label="Loading admin data..." /> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}

      {!loading && !error && active === "overview" ? <OverviewCards overview={overview} /> : null}
      {!loading && !error && active === "users" ? (
        <RecordSection title="Users">
          {users.map((user) => (
            <View key={user.id} style={styles.card}>
              <StatusBadge label={formatStatus(user.role)} tone={user.role === "admin" ? "neutral" : "success"} />
              <Text style={styles.cardTitle}>{user.name || "Unnamed user"}</Text>
              <Text style={styles.body}>{user.email || "No email"} - {user.city || "No city"}</Text>
              <Text style={styles.body}>Email: {user.email_verified ? "verified" : "not verified"} - Identity: {formatStatus(user.verification_status || "not_started")}</Text>
              <Text style={styles.body}>Phone: {user.phone || "Not added"}</Text>
              <View style={styles.row}>
                <AppButton title="Suspend" variant="danger" onPress={() => updateAdminUserStatus(user.id, "suspended").then(load)} style={styles.smallAction} />
                <AppButton title="Reactivate" variant="secondary" onPress={() => updateAdminUserStatus(user.id, "active").then(load)} style={styles.smallAction} />
              </View>
            </View>
          ))}
        </RecordSection>
      ) : null}
      {!loading && !error && active === "rides" ? (
        <RecordSection title="Rides">
          {rides.map((ride) => (
            <View key={ride.id} style={styles.card}>
              <StatusBadge label={formatStatus(ride.status)} tone={ride.status === "open" ? "success" : "warning"} />
              <Text style={styles.cardTitle}>{ride.origin} to {ride.destination}</Text>
              <Text style={styles.body}>{ride.date} at {ride.time} - US${ride.price_usd} - {ride.available_seats} seats</Text>
              <Text style={styles.body}>{ride.driver_name} - {ride.vehicle}</Text>
              <View style={styles.row}>
                <AppButton title="Close ride" variant="danger" onPress={() => updateAdminRideStatus(ride.id, "closed").then(load)} style={styles.smallAction} />
                <AppButton title="Reopen" variant="secondary" onPress={() => updateAdminRideStatus(ride.id, "open").then(load)} style={styles.smallAction} />
              </View>
            </View>
          ))}
        </RecordSection>
      ) : null}
      {!loading && !error && active === "requests" ? (
        <RecordSection title="Bookings and requests">
          {requests.map((request) => (
            <View key={request.id} style={styles.card}>
              <StatusBadge label={formatStatus(request.status)} tone={request.status === "confirmed" ? "success" : "warning"} />
              <Text style={styles.cardTitle}>{request.passenger_name}</Text>
              <Text style={styles.body}>{request.ride_snapshot?.origin || "Ride"} to {request.ride_snapshot?.destination || "destination"} - {request.seats} seat</Text>
              <Text style={styles.body}>Passenger phone: {request.passenger_phone || "Not shared"}</Text>
              <View style={styles.row}>
                <AppButton title="Confirm" variant="secondary" onPress={() => updateAdminRequestStatus(request.id, "confirmed").then(load)} style={styles.smallAction} />
                <AppButton title="Decline" variant="danger" onPress={() => updateAdminRequestStatus(request.id, "declined").then(load)} style={styles.smallAction} />
              </View>
            </View>
          ))}
        </RecordSection>
      ) : null}
      {!loading && !error && active === "verifications" ? (
        <RecordSection title="Driver verifications">
          {verifications.map((item) => (
            <View key={item.driver_id} style={styles.card}>
              <StatusBadge label={formatStatus(item.verification_status)} tone={item.verification_status === "verified" ? "success" : item.verification_status === "rejected" ? "danger" : "warning"} />
              <Text style={styles.cardTitle}>{item.name || "Driver"}</Text>
              <Text style={styles.body}>{item.phone || item.email || "No contact on file"} - {item.document_count} documents</Text>
              <AppButton title="Review submission" variant="secondary" onPress={() => router.push(`/(admin)/verification/${item.driver_id}` as never)} />
            </View>
          ))}
        </RecordSection>
      ) : null}
      {!loading && !error && active === "support" ? (
        <RecordSection title="Support messages">
          {support.map((message) => (
            <View key={message.id} style={styles.card}>
              <StatusBadge label={formatStatus(message.status)} tone={message.status === "resolved" ? "success" : "warning"} />
              <Text style={styles.cardTitle}>{message.subject}</Text>
              <Text style={styles.body}>{message.user_name || message.user_email || "User"} - {message.message}</Text>
              <View style={styles.row}>
                <AppButton title="In review" variant="secondary" onPress={() => updateAdminSupportStatus(message.id, "in_review").then(load)} style={styles.smallAction} />
                <AppButton title="Resolved" onPress={() => updateAdminSupportStatus(message.id, "resolved").then(load)} style={styles.smallAction} />
              </View>
            </View>
          ))}
        </RecordSection>
      ) : null}
      {!loading && !error && active === "reports" ? (
        <RecordSection title="Safety reports">
          {reports.map((report) => (
            <View key={report.id} style={styles.card}>
              <StatusBadge label={formatStatus(report.status)} tone={report.status === "resolved" ? "success" : "warning"} />
              <Text style={styles.cardTitle}>{report.report_type}</Text>
              <Text style={styles.body}>{report.user_name || report.user_email || "User"} - {report.message}</Text>
              <View style={styles.row}>
                <AppButton title="In review" variant="secondary" onPress={() => updateAdminReportStatus(report.id, "in_review").then(load)} style={styles.smallAction} />
                <AppButton title="Resolved" onPress={() => updateAdminReportStatus(report.id, "resolved").then(load)} style={styles.smallAction} />
              </View>
            </View>
          ))}
        </RecordSection>
      ) : null}
      {!loading && !error && active === "actions" ? (
        <RecordSection title="Account actions">
          <ListTile icon="refresh" title="Refresh data" subtitle="Reload admin dashboard records" onPress={load} />
          <ListTile icon="logout" title="Logout" subtitle="Sign out of the admin account" danger onPress={handleLogout} />
        </RecordSection>
      ) : null}
    </Screen>
  );
}

const adminSections: Array<{ key: AdminSection; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "users", label: "Users" },
  { key: "rides", label: "Rides" },
  { key: "requests", label: "Requests" },
  { key: "verifications", label: "Verifications" },
  { key: "support", label: "Support" },
  { key: "reports", label: "Reports" },
  { key: "actions", label: "Actions" },
];

function OverviewCards({ overview }: { overview: AdminOverview | null }) {
  if (!overview) return <EmptyState title="No overview data" body="Admin summary will appear here once data loads." />;
  return (
    <View style={styles.metricGrid}>
      <Metric label="Users" value={overview.users} />
      <Metric label="Rides" value={overview.rides} />
      <Metric label="Requests" value={overview.requests} />
      <Metric label="Pending verification" value={overview.pending_verifications} />
      <Metric label="Support" value={overview.support_messages} />
      <Metric label="Reports" value={overview.safety_reports} />
    </View>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function RecordSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: colors.card,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    gap: spacing.md,
  },
  title: {
    color: colors.whiteText,
    fontSize: 30,
    fontWeight: "900",
  },
  body: {
    color: colors.mutedText,
    lineHeight: 21,
  },
  navGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  navButton: {
    minHeight: 44,
    paddingHorizontal: spacing.md,
  },
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  metric: {
    width: "47%",
    backgroundColor: colors.elevated,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  metricValue: {
    color: colors.primaryGreen,
    fontSize: 28,
    fontWeight: "900",
  },
  metricLabel: {
    color: colors.mutedText,
    fontWeight: "800",
    marginTop: 4,
  },
  section: {
    gap: spacing.md,
  },
  sectionTitle: {
    color: colors.whiteText,
    fontSize: 20,
    fontWeight: "900",
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  cardTitle: {
    color: colors.whiteText,
    fontSize: 18,
    fontWeight: "900",
  },
  row: {
    flexDirection: "row",
    gap: spacing.sm,
    flexWrap: "wrap",
  },
  smallAction: {
    minHeight: 44,
  },
});
