import { autocompletePlaces, clearPlaceSuggestionCache } from "../services/routingService";
import { requestData } from "../services/api";

jest.mock("../services/api", () => ({ requestData: jest.fn() }));
jest.mock("../services/sessionLifecycle", () => ({ onSessionCleared: jest.fn(() => jest.fn()) }));

describe("routing suggestion cache", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearPlaceSuggestionCache();
  });

  it("evicts old searches after the bounded cache reaches capacity", async () => {
    for (let index = 0; index < 21; index += 1) {
      (requestData as jest.Mock).mockResolvedValueOnce([{ place_id: `place-${index}`, description: `Result ${index}` }]);
      await autocompletePlaces(`unique-query-${index}`);
    }

    (requestData as jest.Mock).mockRejectedValueOnce(new Error("offline"));
    await expect(autocompletePlaces("unique-query-0")).rejects.toThrow("offline");
  });
});
