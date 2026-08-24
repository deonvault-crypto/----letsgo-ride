import { uploadWorkerApplicationDocument } from "../services/operationsService";

const mockPost = jest.fn();
const mockRequestData = jest.fn();

jest.mock("../services/api", () => ({
  api: { post: (...args: unknown[]) => mockPost(...args) },
  requestData: (...args: unknown[]) => mockRequestData(...args),
  toFriendlyApiError: jest.fn(() => "Upload failed."),
}));

const persistedApplication = {
  id: "application-1",
  user_id: "customer-1",
  product: "courier",
  full_name: "Tariro Moyo",
  phone: "+263770000000",
  service_area: "Harare",
  service_area_id: "harare",
  vehicle_type: "motorbike",
  vehicle_details: "Honda CB125",
  accepted_terms: true,
  status: "DRAFT",
  documents: [{ id: "document-1", document_type: "identity_document", file_name: "identity.jpg", status: "PENDING" }],
  required_document_types: ["identity_document", "selfie"],
  missing_document_types: ["selfie"],
  created_at: "2026-08-24T12:00:00Z",
  updated_at: "2026-08-24T12:01:00Z",
};

describe("worker document persistence", () => {
  beforeEach(() => jest.clearAllMocks());

  it("only resolves after the uploaded document can be read back from the server", async () => {
    mockPost.mockResolvedValue({ data: { success: true, data: persistedApplication } });
    mockRequestData.mockResolvedValue([persistedApplication]);

    const result = await uploadWorkerApplicationDocument({ applicationId: "application-1", documentType: "identity_document", uri: "file:///identity.jpg", name: "identity.jpg", mimeType: "image/jpeg" });

    expect(mockPost).toHaveBeenCalled();
    expect(mockRequestData).toHaveBeenCalledWith({ method: "GET", url: "/operations/applications/my" });
    expect(result.documents[0].document_type).toBe("identity_document");
  });

  it("does not claim success when the server read-back lacks the document", async () => {
    mockPost.mockResolvedValue({ data: { success: true, data: persistedApplication } });
    mockRequestData.mockResolvedValue([{ ...persistedApplication, documents: [] }]);

    await expect(uploadWorkerApplicationDocument({ applicationId: "application-1", documentType: "identity_document", uri: "file:///identity.jpg", name: "identity.jpg" })).rejects.toThrow("could not be confirmed");
  });
});
