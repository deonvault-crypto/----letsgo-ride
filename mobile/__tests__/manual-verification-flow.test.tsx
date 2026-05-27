import { fireEvent, render, waitFor } from "@testing-library/react-native";
import * as DocumentPicker from "expo-document-picker";

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

jest.mock("expo-document-picker", () => ({
  getDocumentAsync: jest.fn(),
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
    (uploadVerificationDocument as jest.Mock).mockResolvedValue({
      id: "doc-1",
      document_type: "identity_document",
      file_name: "id.pdf",
      status: "pending",
    });
    (submitManualVerification as jest.Mock).mockResolvedValue(verifiedProfile);
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: "file:///id.pdf", name: "id.pdf", mimeType: "application/pdf" }],
    });
  });

  it("opens verification, uploads a required document, and submits for review", async () => {
    const screen = render(<DriverVerificationScreen />);

    expect(await screen.findAllByText("Driver verification")).toHaveLength(2);
    expect(screen.getByText("Verify your identity before posting public rides.")).toBeOnTheScreen();
    expect(screen.getByText("Upload your identity document, driver licence, selfie, and vehicle details. LetsGoRide checks your documents automatically and may request manual review if needed.")).toBeOnTheScreen();

    fireEvent.press(screen.getAllByRole("button", { name: "Upload" })[0]);

    await waitFor(() => {
      expect(uploadVerificationDocument).toHaveBeenCalledWith({
        documentType: "identity_document",
        uri: "file:///id.pdf",
        name: "id.pdf",
        mimeType: "application/pdf",
      });
    });

    fireEvent.press(screen.getByRole("checkbox", { name: "Driver verification consent" }));
    fireEvent.changeText(screen.getByLabelText("Message for verification team"), "Vehicle logbook is in my name.");
    fireEvent.press(screen.getByRole("button", { name: "Submit for review" }));

    await waitFor(() => {
      expect(submitManualVerification).toHaveBeenCalledWith({
        consent: true,
        verification_notes: "Vehicle logbook is in my name.",
      });
      expect(screen.getByText("Your driver verification is approved.")).toBeOnTheScreen();
    });
  });

  it("shows a complete submitted state while verification is pending", async () => {
    (getMyVerification as jest.Mock).mockResolvedValueOnce(pendingProfile);

    const screen = render(<DriverVerificationScreen />);

    expect(await screen.findByText("Verification submitted")).toBeOnTheScreen();
    expect(screen.getByText("Submitted documents")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Submit for review" })).toBeNull();
  });
});
