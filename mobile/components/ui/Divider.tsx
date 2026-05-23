import { StyleSheet, View } from "react-native";

import { colors } from "../../constants/colors";

export function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  divider: {
    height: 1,
    backgroundColor: colors.border,
    opacity: 0.75,
  },
});
