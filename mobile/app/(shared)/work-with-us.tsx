import { Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { Screen } from "../../components/ui/Screen";
import { v2Theme } from "../../constants/v2Theme";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { WorkerProduct } from "../../types/operations.types";
import { intentForProduct } from "../../utils/authIntent";

const products: Array<{ product: WorkerProduct; icon: keyof typeof MaterialCommunityIcons.glyphMap; title: string; body: string }> = [
  { product: "courier", icon: "bike-fast", title: "Apply to deliver", body: "Courier profile, vehicle, identity and selfie review before work access." },
  { product: "driver", icon: "steering", title: "Become a Driver", body: "Identity, licence, vehicle and selfie review before posting passenger trips." },
  { product: "merchant", icon: "storefront-outline", title: "Partner with LetsGoRide", body: "Business and owner review before restaurant onboarding and activation." },
];
export default function WorkWithUsScreen() {
  const router = useRouter(); const { user, isGuest, loading } = useCurrentUser();
  function open(product: WorkerProduct) {
    if (loading) return;
    if (isGuest) {
      router.push({ pathname: "/(auth)/email-login", params: { intent: intentForProduct(product) } } as never);
      return;
    }
    router.push({ pathname: "/(shared)/worker-application", params: { product } } as never);
  }
  const unavailable = Boolean(user && user.role !== "passenger");
  return <Screen title="Work with us" showBack fallbackRoute="/(shared)/account"><View style={styles.hero}><Text style={styles.eyebrow}>WORK WITH LETSGORIDE</Text><Text style={styles.title}>Choose how you’d like to join.</Text><Text style={styles.body}>Tell us about yourself or your business. You can save your progress and return before submitting.</Text></View>{unavailable ? <View style={styles.current}><MaterialCommunityIcons name="check-decagram-outline" size={24} color={v2Theme.colors.brandStrong} /><Text style={styles.currentText}>You’re signed in as {user?.role}. Manage your profile and documents from Account.</Text></View> : null}<View style={styles.list}>{products.map((item) => <Pressable key={item.product} accessibilityRole="button" onPress={() => open(item.product)} disabled={loading || unavailable} style={({ pressed }) => [styles.card, (loading || unavailable) && styles.disabled, pressed && styles.pressed]}><View style={styles.icon}><MaterialCommunityIcons name={item.icon} size={29} color={v2Theme.colors.brandStrong} /></View><View style={styles.flex}><Text style={styles.cardTitle}>{item.title}</Text><Text style={styles.cardBody}>{item.body}</Text></View><MaterialCommunityIcons name="arrow-right" size={21} color={v2Theme.colors.inkTertiary} /></Pressable>)}</View>{isGuest ? <View style={styles.signIn}><Text style={styles.signInTitle}>Already have an account?</Text><Text style={styles.cardBody}>Choose an application above and we’ll keep your selection while you sign in.</Text></View> : null}</Screen>;
}
const styles = StyleSheet.create({ flex: { flex: 1 }, hero: { borderRadius: 27, backgroundColor: v2Theme.colors.ink, padding: 19, gap: 9 }, eyebrow: { color: "#8FE6AE", fontSize: 9, fontWeight: "900", letterSpacing: 1.1 }, title: { color: "#FFFFFF", fontSize: 28, lineHeight: 33, fontWeight: "900", letterSpacing: -0.8 }, body: { color: "rgba(255,255,255,0.65)", fontSize: 11, lineHeight: 17 }, current: { borderRadius: 20, backgroundColor: v2Theme.colors.brandSofter, padding: 13, flexDirection: "row", gap: 9 }, currentText: { flex: 1, color: v2Theme.colors.inkSecondary, fontSize: 10, lineHeight: 15 }, list: { gap: 9 }, card: { borderRadius: 24, backgroundColor: v2Theme.colors.surface, padding: 14, flexDirection: "row", alignItems: "center", gap: 11 }, icon: { width: 54, height: 54, borderRadius: 19, backgroundColor: v2Theme.colors.brandSoft, alignItems: "center", justifyContent: "center" }, cardTitle: { color: v2Theme.colors.ink, fontSize: 14, fontWeight: "900" }, cardBody: { color: v2Theme.colors.inkSecondary, fontSize: 10, lineHeight: 15, marginTop: 3 }, signIn: { borderRadius: 24, backgroundColor: v2Theme.colors.surfaceMuted, padding: 15, gap: 7 }, signInTitle: { color: v2Theme.colors.ink, fontSize: 14, fontWeight: "900" }, signInButton: { minHeight: 48, borderRadius: 15, backgroundColor: v2Theme.colors.brand, alignItems: "center", justifyContent: "center", marginTop: 3 }, signInButtonText: { color: "#FFFFFF", fontSize: 10, fontWeight: "900" }, disabled: { opacity: 0.4 }, pressed: { opacity: 0.72 } });
