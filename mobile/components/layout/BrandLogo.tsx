import { StyleSheet, Text, View } from "react-native";

import { colors } from "../../constants/colors";

export function BrandLogo({ size = "regular" }: { size?: "small" | "regular" | "large" }) {
  return (
    <View style={styles.wrap}>
      <Text style={[styles.text, styles[size]]}>
        Lets<Text style={styles.green}>Go</Text>Ride
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: "flex-start",
  },
  text: {
    color: colors.whiteText,
    fontWeight: "900",
    letterSpacing: 0,
  },
  small: {
    fontSize: 20,
  },
  regular: {
    fontSize: 28,
  },
  large: {
    fontSize: 34,
  },
  green: {
    color: colors.primaryGreen,
  },
});
