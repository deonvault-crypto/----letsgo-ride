import { fireEvent, render, waitFor } from "@testing-library/react-native";
import * as ImagePicker from "expo-image-picker";

import DriverVerificationScreen from "../app/(shared)/verification";
import {
  getMyVerification,
  submitManualVerification,
  uploadVerificationDocument,
} from "../services/verificationService";
import { notStartedProfile, pendingProfile, verifiedProfile } from "./fixtures";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => "/verification",
  useFocusEffect: (callback: () => void | (() => void)) => {
    const React = require("react");
    React.useEffect(() => callback(), [callback]);
  },
}));

jest.mock("expo-image-picker", () => ({
  CameraType: { back: "back", front: "front" },
  launchCameraAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(),
}));

jest.mock("../services/verificationService", () => ({
  getMyVerification: jest.fn(),
  submitManualVerification: jest.fn(),
  uploadVerificationDocument: jest.fn(),
}));

describe("manual driver verification flow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getMyVerification as jest.Mock).mockResolvedValue(notStartedProfile);
    (uploadVerificationDocument as jest.Mock).mockImplementation(async ({ documentType, name }) => ({
      id: `doc-${documentType}`,
      document_type: documentType,
      file_name: name,
      file_url: `https://res.cloudinary.com/demo/${name}`,
      cloudinary_public_id: `letsgoride/verification/${documentType}/${name}`,
      status: "pending",
    }));
    (submitManualVerification as jest.Mock).mockResolvedValue(verifiedProfile);
    (ImagePicker.requestCameraPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
    (ImagePicker.launchCameraAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: "file:///selfie.jpg", fileName: "selfie.jpg", mimeType: "image/jpeg" }],
    });
  });

  it("opens verification, captures required documents, and submits for review", async () => {
    const screen = render(<DriverVerificationScreen />);

    expect(await screen.findByText("Driver verification")).toBeOnTheScreen();
    expect(screen.getByText("Complete a camera-based identity check before posting public rides.")).toBeOnTheScreen();
    expect(screen.getByText("LetsGoRide uses live capture for your selfie, identity document, driver licence, and vehicle record. If automated checks need help, the same captured documents move to manual review.")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Submit for review" }).props.accessibilityState.disabled).toBe(true);

    fireEvent.press(screen.getByRole("button", { name: /Take selfie/ }));

    await waitFor(() => {
      expect(uploadVerificationDocument).toHaveBeenCalledWith({
        documentType: "selfie",
        uri: "file:///selfie.jpg",
        name: "selfie.jpg",
        mimeType: "image/jpeg",
      });
      expect(screen.getAllByText("✓ Captured - Pending").length).toBeGreaterThan(0);
    });

    fireEvent.press(screen.getByRole("button", { name: /Scan identity document/ }));
    await waitFor(() => {
      expect(uploadVerificationDocument).toHaveBeenCalledTimes(2);
    });
    fireEvent.press(screen.getByRole("button", { name: /Scan driver licence/ }));
    await waitFor(() => {
      expect(uploadVerificationDocument).toHaveBeenCalledTimes(3);
    });
    fireEvent.press(screen.getByRole("button", { name: /Scan registration\/logbook/ }));

    await waitFor(() => {
      expect(uploadVerificationDocument).toHaveBeenCalledTimes(4);
      expect(screen.getAllByText("✓ Captured - Pending").length).toBe(4);
    });

    fireEvent.press(screen.getByRole("checkbox", { name: "Driver verification consent" }));
    fireEvent.changeText(screen.getByLabelText("Message for verification team"), "Vehicle logbook is in my name.");
    expect(screen.getByRole("button", { name: "Submit for review" }).props.accessibilityState.disabled).toBe(false);
    fireEvent.press(screen.getByRole("button", { name: "Submit for review" }));

    await waitFor(() => {
      expect(submitManualVerification).toHaveBeenCalledWith({
        consent: true,
        verification_notes: "Vehicle logbook is in my name.",
      });
      expect(screen.getByText("Your driver verification is approved.")).toBeOnTheScreen();
    });
  });

  it("shows a clear upload failure after the camera returns a photo", async () => {
    (uploadVerificationDocument as jest.Mock).mockRejectedValueOnce(new Error("Network error"));

    const screen = render(<DriverVerificationScreen />);

    expect(await screen.findByText("Driver verification")).toBeOnTheScreen();
    fireEvent.press(screen.getByRole("button", { name: /Take selfie/ }));

    expect(await screen.findByText("Photo captured, but upload failed. Please try again.")).toBeOnTheScreen();
    expect(screen.getAllByText("Not captured").length).toBeGreaterThan(0);
  });

  it("shows a complete submitted state while verification is pending", async () => {
    (getMyVerification as jest.Mock).mockResolvedValueOnce(pendingProfile);

    const screen = render(<DriverVerificationScreen />);

    expect(await screen.findByText("Verification submitted")).toBeOnTheScreen();
    expect(screen.getByText("Submitted documents")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Submit for review" })).toBeNull();
  });

  it("shows only the retry card when verification status fails to load", async () => {
    (getMyVerification as jest.Mock).mockRejectedValueOnce(new Error("Something went wrong. Please try again."));

    const screen = render(<DriverVerificationScreen />);

    expect(await screen.findByText("Unable to load data")).toBeOnTheScreen();
    expect(screen.getByText("Something went wrong. Please try again.")).toBeOnTheScreen();
    expect(screen.queryByText("Capture documents")).toBeNull();
    expect(screen.queryByRole("button", { name: /Take selfie/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Retry" })).toBeOnTheScreen();
  });
});
