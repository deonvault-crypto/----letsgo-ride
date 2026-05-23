import { Alert, Linking } from "react-native";

export async function openExternalUrl(url: string) {
  try {
    const supported = await Linking.canOpenURL(url);
    if (!supported) {
      Alert.alert("Link unavailable", "This link could not be opened on your device.");
      return;
    }
    await Linking.openURL(url);
  } catch {
    Alert.alert("Link unavailable", "This link could not be opened right now.");
  }
}
