import { fireEvent, render, waitFor } from "@testing-library/react-native";
import React from "react";

import WorkerApplicationScreen from "../app/(shared)/worker-application";
import { listMyWorkerApplications, saveWorkerApplication, submitWorkerApplication } from "../services/operationsService";
import { WorkerApplication } from "../types/operations.types";

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ product: "merchant" }),
  useSegments: () => ["(shared)", "worker-application"],
  usePathname: () => "/worker-application",
  useRouter: () => ({ back: jest.fn(), replace: jest.fn(), push: jest.fn(), canGoBack: () => true }),
  useFocusEffect: (callback: () => void) => require("react").useEffect(callback, [callback]),
}));

jest.mock("../hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({ user: { name: "Kudakwashe", phone: "+48123456789", city: "Harare", role: "passenger" } }),
}));

jest.mock("../services/operationsService", () => ({
  listMyWorkerApplications: jest.fn(),
  saveWorkerApplication: jest.fn(),
  submitWorkerApplication: jest.fn(),
  uploadWorkerApplicationDocument: jest.fn(),
}));

const mockList = listMyWorkerApplications as jest.MockedFunction<typeof listMyWorkerApplications>;
const mockSave = saveWorkerApplication as jest.MockedFunction<typeof saveWorkerApplication>;
const mockSubmit = submitWorkerApplication as jest.MockedFunction<typeof submitWorkerApplication>;

function application(status: WorkerApplication["status"] = "DRAFT", complete = false): WorkerApplication {
  const documents = complete
    ? [
        { id: "doc-1", document_type: "identity_document" as const, file_name: "identity.jpg", status: "PENDING" as const },
        { id: "doc-2", document_type: "business_registration" as const, file_name: "business.jpg", status: "PENDING" as const },
      ]
    : [];
  return {
    id: "application-1",
    user_id: "customer-1",
    product: "merchant",
    full_name: "Kudakwashe",
    phone: "+48123456789",
    service_area: "Harare",
    service_area_id: "harare",
    business_name: "LetsGoRide Kitchen Avondale",
    business_address: "12 Amos Street",
    business_registration_number: "637336272838",
    accepted_terms: true,
    status,
    documents,
    required_document_types: ["identity_document", "business_registration"],
    missing_document_types: complete ? [] : ["identity_document", "business_registration"],
    created_at: "2026-08-24T10:00:00Z",
    updated_at: "2026-08-24T10:00:00Z",
  };
}

describe("worker application saved and review states", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("reopens a saved draft as a read-only summary and allows explicit editing", async () => {
    mockList.mockResolvedValue([application()]);
    const screen = render(<WorkerApplicationScreen />);

    expect((await screen.findAllByText("Saved draft")).length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Saved application summary")).toBeOnTheScreen();
    expect(screen.queryByLabelText("Business name")).toBeNull();

    fireEvent.press(screen.getByRole("button", { name: "Edit details" }));
    expect(screen.getByLabelText("Business name")).toHaveProp("value", "LetsGoRide Kitchen Avondale");
  });

  it("confirms a save from the server before replacing fields with the draft summary", async () => {
    const draft = application();
    const saved = { ...draft, business_name: "LetsGoRide Kitchen Borrowdale" };
    mockList.mockResolvedValueOnce([draft]).mockResolvedValueOnce([saved]);
    mockSave.mockResolvedValue(saved);
    const screen = render(<WorkerApplicationScreen />);
    await screen.findAllByText("Saved draft");
    fireEvent.press(screen.getByRole("button", { name: "Edit details" }));
    fireEvent.changeText(screen.getByLabelText("Business name"), "LetsGoRide Kitchen Borrowdale");
    fireEvent.press(screen.getByRole("button", { name: "Save application" }));

    await waitFor(() => expect(screen.getByText("LetsGoRide Kitchen Borrowdale")).toBeOnTheScreen());
    expect(mockList).toHaveBeenCalledTimes(2);
    expect(screen.queryByLabelText("Business name")).toBeNull();
  });

  it("uses a master review before submission and locks the submitted result", async () => {
    const draft = application("DRAFT", true);
    const submitted = { ...draft, status: "SUBMITTED" as const, submitted_at: "2026-08-24T11:00:00Z" };
    mockList.mockResolvedValue([draft]);
    mockSubmit.mockResolvedValue(submitted);
    const screen = render(<WorkerApplicationScreen />);
    await screen.findAllByText("Saved draft");

    fireEvent.press(screen.getByRole("button", { name: "Review application" }));
    expect(screen.getByLabelText("Application review")).toBeOnTheScreen();
    expect(screen.getByText("Declaration accepted")).toBeOnTheScreen();
    fireEvent.press(screen.getByRole("button", { name: "Submit application" }));

    expect(await screen.findByText("Application submitted")).toBeOnTheScreen();
    expect(screen.getByText("Under review")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Edit details" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Submit application" })).toBeNull();
  });

  it("keeps a reopened submitted application locked", async () => {
    mockList.mockResolvedValue([application("UNDER_REVIEW", true)]);
    const screen = render(<WorkerApplicationScreen />);
    expect(await screen.findByText("Application submitted")).toBeOnTheScreen();
    expect(screen.getByText(/read-only while its current review status/i)).toBeOnTheScreen();
    expect(screen.queryByLabelText("Business name")).toBeNull();
  });

  it("keeps an approved application as a locked saved summary", async () => {
    mockList.mockResolvedValue([application("APPROVED", true)]);
    const screen = render(<WorkerApplicationScreen />);
    expect(await screen.findByText("Application approved")).toBeOnTheScreen();
    expect(screen.getByLabelText("Saved application summary")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Edit details" })).toBeNull();
    expect(screen.queryByLabelText("Business name")).toBeNull();
  });

  it("reopens editing when an admin has requested changes", async () => {
    mockList.mockResolvedValue([{ ...application("REJECTED"), review_note: "Upload a clearer registration document." }]);
    const screen = render(<WorkerApplicationScreen />);
    expect(await screen.findByText("Changes requested")).toBeOnTheScreen();
    fireEvent.press(screen.getByRole("button", { name: "Edit details" }));
    expect(screen.getByLabelText("Business name")).toBeOnTheScreen();
  });
});
