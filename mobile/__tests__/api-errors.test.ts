import { AxiosError } from "axios";

import { toFriendlyApiError } from "../services/api";
import { ApiResponse } from "../types/api.types";

function apiError({
  status,
  url,
  message,
}: {
  status?: number;
  url?: string;
  message?: string;
}) {
  return {
    config: { url },
    response: status
      ? {
          status,
          data: message ? { success: false, error: message } : { success: false },
        }
      : undefined,
  } as AxiosError<ApiResponse<unknown>>;
}

describe("API error messages", () => {
  it("turns network failures into a connection message", () => {
    expect(toFriendlyApiError(apiError({ url: "/rides" }))).toBe(
      "Could not connect to LetsGoRide. Please check your connection and try again.",
    );
  });

  it("keeps wrong-password errors specific on login", () => {
    expect(toFriendlyApiError(apiError({ status: 401, url: "/auth/email-login" }))).toBe(
      "Email or password is incorrect.",
    );
  });

  it("uses a session-expired message for authenticated screens", () => {
    expect(toFriendlyApiError(apiError({ status: 401, url: "/notifications" }))).toBe(
      "Your session expired. Please log in again.",
    );
  });

  it("uses a stable server-error message", () => {
    expect(toFriendlyApiError(apiError({ status: 503, url: "/rides" }))).toBe(
      "Something went wrong. Please try again.",
    );
  });

  it("preserves useful business-rule messages from the backend", () => {
    expect(
      toFriendlyApiError(
        apiError({
          status: 400,
          url: "/requests",
          message: "You cannot request a seat on your own ride.",
        }),
      ),
    ).toBe("You cannot request a seat on your own ride.");
  });
});
