import { Pressable, StyleSheet, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { colors } from "../../constants/colors";
import { spacing } from "../../constants/spacing";
import { BrandLogo } from "./BrandLogo";

export function BrandWordmark({ compact = false }: { compact?: boolean }) {
  return <BrandLogo size={compact ? "small" : "regular"} />;
}

export function Header({ title: _title }: { title?: string }) {
  const router = useRouter();
  return (
    <View style={styles.header}>
      <BrandLogo size="small" />
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
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
