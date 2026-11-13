-- Payment records for synthetic verification. Amounts are integer minor units.
CREATE TABLE lab_payments (
  id TEXT PRIMARY KEY,
  provider_account TEXT NOT NULL,
  provider_payment_id TEXT NOT NULL,
  currency TEXT NOT NULL CHECK (length(currency) = 3),
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  status TEXT NOT NULL CHECK (status IN ('authorized', 'captured')),
  UNIQUE (provider_account, provider_payment_id)
) STRICT;

CREATE TABLE lab_payment_events (
  provider_account TEXT NOT NULL,
  provider_event_id TEXT NOT NULL,
  payment_id TEXT NOT NULL REFERENCES lab_payments (id),
  currency TEXT NOT NULL,
  amount_minor INTEGER NOT NULL,
  PRIMARY KEY (provider_account, provider_event_id)
) STRICT;

CREATE TABLE lab_payment_ledger (
  payment_id TEXT PRIMARY KEY REFERENCES lab_payments (id),
  currency TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0)
) STRICT;

-- The first verified capture and its ledger entry commit together. A later
-- event for the same provider payment cannot post a second ledger entry.
CREATE TRIGGER lab_post_capture AFTER INSERT ON lab_payment_events
BEGIN
  UPDATE lab_payments SET status = 'captured' WHERE id = NEW.payment_id AND status = 'authorized';
  INSERT INTO lab_payment_ledger (payment_id, currency, amount_minor)
    SELECT id, currency, amount_minor FROM lab_payments WHERE id = NEW.payment_id
    ON CONFLICT (payment_id) DO NOTHING;
END;
