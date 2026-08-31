export type WorkerRole = "driver" | "courier";
export type PayoutMethodType = "ECOCASH" | "BANK";

export type WorkerPayoutMethod = {
  id: string;
  method_type: PayoutMethodType;
  account_holder_name: string;
  bank_name?: string | null;
  branch_name?: string | null;
  branch_code?: string | null;
  currency: string;
  masked_reference: string;
  is_default: boolean;
  created_at?: string;
  updated_at?: string;
};

export type WorkerLedgerEntry = {
  id: string;
  source_type: "RIDE_NOW" | "COURIER_DELIVERY" | "FOOD_DELIVERY" | string;
  source_id: string;
  label: string;
  gross_usd: number;
  platform_commission_usd?: number | null;
  worker_earnings_usd: number;
  payment_method?: string | null;
  settlement_state: string;
  occurred_at?: string | null;
};

export type WorkerPayoutRecord = {
  id: string;
  amount_usd: number;
  status: string;
  payout_method_id?: string | null;
  created_at?: string;
  paid_at?: string | null;
};

export type DriverFeeStatement = {
  id: string;
  status: "due" | "overdue" | "paid" | string;
  currency: string;
  ride_count: number;
  gross_fares_usd: number;
  platform_fee_usd: number;
  amount_due_usd: number;
  period_start?: string | null;
  period_end?: string | null;
  issued_at?: string | null;
  due_at?: string | null;
  grace_ends_at?: string | null;
  paid_at?: string | null;
  stripe_payment_status?: string | null;
};

export type DriverCurrentWeek = {
  ride_count: number;
  gross_fares_usd: number;
  platform_fee_accrued_usd: number;
  period_start?: string | null;
  period_end?: string | null;
};

export type WorkerWallet = {
  currency: "USD" | string;
  worker_role: WorkerRole;
  available_balance_usd: number;
  gross_earnings_usd: number;
  net_earnings_usd: number;
  cash_collected_usd: number;
  digital_earnings_usd: number;
  amount_due_to_platform_usd: number;
  platform_commission_usd: number;
  paid_out_usd: number;
  ledger: WorkerLedgerEntry[];
  payout_history: WorkerPayoutRecord[];
  payout_methods: WorkerPayoutMethod[];
  settlement_integrated: boolean;
  current_week?: DriverCurrentWeek;
  current_statement?: DriverFeeStatement | null;
  statement_history?: DriverFeeStatement[];
  settlement_required?: boolean;
  settlement_button_visible?: boolean;
  settlement_payment_enabled?: boolean;
  ride_now_finance_paused?: boolean;
  settlement_policy?: "weekly_postpaid" | string;
  grace_days?: number;
  cash_policy?: string;
  platform_fee_policy?: string;
};

export type DriverFeePaymentIntent = {
  payment_intent_id: string;
  client_secret: string;
  publishable_key: string;
  status: string;
  amount: number;
  currency: string;
  statement: DriverFeeStatement;
};

export type PayoutMethodInput = {
  method_type: PayoutMethodType;
  account_holder_name: string;
  mobile_number?: string;
  bank_name?: string;
  account_number?: string;
  branch_name?: string;
  branch_code?: string;
  currency?: string;
  make_default?: boolean;
};

export type PayoutMethodUpdateInput = {
  account_holder_name?: string;
  mobile_number?: string;
  bank_name?: string;
  account_number?: string;
  branch_name?: string | null;
  branch_code?: string | null;
  currency?: string;
  make_default?: boolean;
};
