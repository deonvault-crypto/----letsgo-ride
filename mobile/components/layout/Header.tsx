import { Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { colors } from "../../constants/colors";
import { spacing } from "../../constants/spacing";

export function BrandWordmark({ compact = false }: { compact?: boolean }) {
  return (
    <View style={styles.brand}>
      <MaterialCommunityIcons name="road-variant" size={compact ? 24 : 30} color={colors.primaryGreen} />
      <Text style={[styles.brandText, compact && styles.brandTextSmall]}>
        Lets<Text style={styles.green}>Go</Text>Ride
      </Text>
    </View>
  );
}

export function Header({ title }: { title?: string }) {
  const router = useRouter();
  return (
    <View style={styles.header}>
      <BrandWordmark compact />
      {title ? <Text style={styles.title}>{title}</Text> : null}
      <Pressable onPress={() => router.push("/(shared)/notifications" as never)} style={styles.iconButton}>
        <MaterialCommunityIcons name="bell-outline" size={21} color={colors.whiteText} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  brand: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  brandText: {
    color: colors.whiteText,
    fontWeight: "900",
    fontSize: 26,
    letterSpacing: 0,
  },
  brandTextSmall: {
    fontSize: 17,
  },
  green: {
    color: colors.primaryGreen,
  },
  title: {
    color: colors.mutedText,
    fontWeight: "800",
    fontSize: 13,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
