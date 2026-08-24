import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { v2Theme } from "../../constants/v2Theme";

export function AppNotice({ title, message, actionLabel, onAction, onDismiss, autoDismissMs = 0 }: { title?: string; message: string | null | undefined; actionLabel?: string; onAction?: () => void; onDismiss?: () => void; autoDismissMs?: number }) {
  useEffect(() => {
    if (!message || !onDismiss || autoDismissMs <= 0) return;
    const timer = setTimeout(onDismiss, autoDismissMs);
    return () => clearTimeout(timer);
  }, [autoDismissMs, message, onDismiss]);
  if (!message) return null;
  return <View accessible accessibilityRole="alert" style={styles.notice}><MaterialCommunityIcons name="alert-circle-outline" size={19} color={v2Theme.colors.warning} /><View style={styles.copy}>{title ? <Text style={styles.title}>{title}</Text> : null}<Text style={styles.message}>{message}</Text></View>{onAction && actionLabel ? <Pressable accessibilityRole="button" onPress={onAction}><Text style={styles.action}>{actionLabel}</Text></Pressable> : null}{onDismiss ? <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" onPress={onDismiss}><MaterialCommunityIcons name="close" size={18} color={v2Theme.colors.inkSecondary} /></Pressable> : null}</View>;
}

const styles = StyleSheet.create({ notice: { minHeight: 48, borderRadius: 16, backgroundColor: "#FFF8E7", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(146,101,12,0.2)", paddingHorizontal: 12, paddingVertical: 9, flexDirection: "row", alignItems: "center", gap: 9, shadowColor: v2Theme.colors.shadow, shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 2 }, copy: { flex: 1, gap: 2 }, title: { color: v2Theme.colors.ink, fontSize: 10, fontWeight: "900" }, message: { color: v2Theme.colors.inkSecondary, fontSize: 10, lineHeight: 15 }, action: { color: v2Theme.colors.brandStrong, fontSize: 10, fontWeight: "900" } });
