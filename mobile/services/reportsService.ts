import { requestData } from "./api";

export type SafetyReport = {
  id: string;
  report_type: string;
  message: string;
  status: string;
  created_at?: string;
};

export async function createReport(data: {
  report_type: string;
  message: string;
  ride_id?: string;
  user_phone?: string;
}) {
  return requestData<SafetyReport>({ method: "POST", url: "/reports", data });
}

export async function myReports() {
  return requestData<SafetyReport[]>({ method: "GET", url: "/reports/my" });
}
