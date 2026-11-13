CREATE INDEX dispatch_pending_expiry ON dispatch_offers(expires_ms) WHERE status='pending';
