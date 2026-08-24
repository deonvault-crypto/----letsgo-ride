import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ImageBackground, ImageSourcePropType, Pressable, StyleSheet, Text, View } from "react-native";

import { v2Theme } from "../../constants/v2Theme";

type ServiceStoryCardProps = {
  title: string;
  subtitle: string;
  eyebrow: string;
  image: ImageSourcePropType;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  onPress: () => void;
  compact?: boolean;
};

export function ServiceStoryCard({ title, subtitle, eyebrow, image, icon, onPress, compact = false }: ServiceStoryCardProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${subtitle}`}
      onPress={onPress}
      style={({ pressed }) => [styles.shell, compact && styles.compactShell, pressed && styles.pressed]}
    >
      <ImageBackground source={image} resizeMode="cover" style={styles.image} imageStyle={styles.imageCorners}>
        <View style={styles.scrim} />
        <View style={styles.topRow}>
          <Text style={styles.eyebrow}>{eyebrow}</Text>
          <View style={styles.iconChip}><MaterialCommunityIcons name={icon} size={18} color="#FFFFFF" /></View>
        </View>
        <View style={styles.copy}>
          <Text style={[styles.title, compact && styles.compactTitle]}>{title}</Text>
          <Text numberOfLines={2} style={styles.subtitle}>{subtitle}</Text>
        </View>
        <View style={styles.arrow}><MaterialCommunityIcons name="arrow-right" size={19} color={v2Theme.colors.ink} /></View>
      </ImageBackground>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shell: { height: 214, borderRadius: v2Theme.radius.xxl, overflow: "hidden", backgroundColor: v2Theme.colors.ink, shadowColor: v2Theme.colors.shadow, shadowOpacity: 0.13, shadowRadius: 22, shadowOffset: { width: 0, height: 11 }, elevation: 5 },
  compactShell: { width: 176, height: 190 },
  image: { flex: 1, padding: 16, justifyContent: "space-between" },
  imageCorners: { borderRadius: v2Theme.radius.xxl },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(10,14,11,0.32)" },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  eyebrow: { color: "rgba(255,255,255,0.86)", fontSize: 9, fontWeight: "900", letterSpacing: 1.1 },
  iconChip: { width: 38, height: 38, borderRadius: 14, backgroundColor: "rgba(12,18,14,0.46)", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.34)", alignItems: "center", justifyContent: "center" },
  copy: { gap: 5, paddingRight: 42 },
  title: { color: "#FFFFFF", fontSize: 29, lineHeight: 32, fontWeight: "900", letterSpacing: -0.8, textShadowColor: "rgba(0,0,0,0.28)", textShadowRadius: 8 },
  compactTitle: { fontSize: 24, lineHeight: 27 },
  subtitle: { color: "rgba(255,255,255,0.84)", fontSize: 12, lineHeight: 17, fontWeight: "700", textShadowColor: "rgba(0,0,0,0.24)", textShadowRadius: 7 },
  arrow: { position: "absolute", right: 15, bottom: 15, width: 38, height: 38, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.92)", alignItems: "center", justifyContent: "center" },
  pressed: { opacity: 0.88, transform: [{ scale: 0.992 }] },
});
