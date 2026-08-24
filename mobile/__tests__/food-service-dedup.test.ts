import { listRestaurants } from "../services/foodService";
import { requestData } from "../services/api";

jest.mock("../services/api", () => ({ requestData: jest.fn() }));

const mockRequestData = requestData as jest.MockedFunction<typeof requestData>;

it("deduplicates simultaneous restaurant requests", async () => {
  let resolve!: (value: unknown[]) => void;
  const request = new Promise<unknown[]>((done) => { resolve = done; });
  mockRequestData.mockReturnValue(request);

  const first = listRestaurants();
  const second = listRestaurants();
  expect(mockRequestData).toHaveBeenCalledTimes(1);

  resolve([]);
  await expect(first).resolves.toEqual([]);
  await expect(second).resolves.toEqual([]);
});
