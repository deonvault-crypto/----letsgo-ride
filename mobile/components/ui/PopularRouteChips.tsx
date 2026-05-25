import { Pressable, ScrollView, StyleSheet, Text } from "react-native";

import { colors } from "../../constants/colors";
import { zimbabweRoutes } from "../../constants/routes";
import { spacing } from "../../constants/spacing";

export function PopularRouteChips({
  onSelect,
  limit = 5,
}: {
  onSelect: (origin: string, destination: string) => void;
  limit?: number;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {zimbabweRoutes.slice(0, limit).map((route) => (
        <Pressable
          key={`${route.origin}-${route.destination}`}
          style={styles.chip}
          onPress={() => onSelect(route.origin, route.destination)}
        >
          <Text numberOfLines={1} style={styles.text}>{`${route.origin} to ${route.destination}`}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: spacing.sm,
    paddingRight: spacing.screen,
    paddingBottom: spacing.xs,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 999,
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.border,
    maxWidth: 240,
  },
  text: {
    color: colors.whiteText,
    fontWeight: "800",
    fontSize: 13,
  },
});
