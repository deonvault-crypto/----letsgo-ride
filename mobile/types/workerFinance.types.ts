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
  source_type: string;
  source_id: string;
  label: string;
  gross_usd: number;
  platform_commission_usd?: number | null;
  worker_earnings_usd: number;
  payment_method?: string | null;
  settlement_state: string;
  occurred_at?: string;
};

export type WorkerPayout = {
  id: string;
  amount_usd: number;
  status: string;
  payout_method_id?: string;
  provider_reference?: string;
  created_at?: string;
  paid_at?: string;
};

export type DriverSettlementStatement = {
  id: string;
  period_start: string;
  period_end: string;
  ride_count: number;
  gross_fares_usd: number;
  amount_due_usd: number;
  status: "due" | "overdue" | "paid";
  due_at?: string | null;
  paid_at?: string | null;
};

export type DriverSettlementSummary = {
  status: "clear" | "current" | "due" | "overdue";
  current_period_start: string;
  current_period_end: string;
  current_week_ride_count: number;
  current_week_cash_fares_usd: number;
  current_week_platform_fees_usd: number;
  amount_due_usd: number;
  outstanding_statement_count: number;
  earliest_due_at?: string | null;
  can_settle: boolean;
  ride_now_blocked: boolean;
  recent_statements: DriverSettlementStatement[];
};

export type WorkerWallet = {
  currency: string;
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
  payout_history: WorkerPayout[];
  payout_methods: WorkerPayoutMethod[];
  settlement_integrated: boolean;
  cash_policy?: string;
  platform_fee_policy?: string;
  driver_settlement?: DriverSettlementSummary;
};

export type DriverSettlementIntent = {
  payment_intent_id: string;
  settlement_payment_id: string;
  client_secret: string;
  publishable_key: string;
  status: string;
  amount: number;
  currency: string;
};

export type PayoutMethodCreatePayload = {
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

export type PayoutMethodUpdatePayload = {
  account_holder_name?: string;
  mobile_number?: string;
  bank_name?: string;
  account_number?: string;
  branch_name?: string | null;
  branch_code?: string | null;
  currency?: string;
  make_default?: boolean;
};

export type PayoutMethodCreateInput = PayoutMethodCreatePayload;
export type PayoutMethodUpdateInput = PayoutMethodUpdatePayload;
