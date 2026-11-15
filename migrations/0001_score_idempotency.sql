-- Apply after 0000. A reservation and its score/response commit together;
-- uncommitted reservations disappear on rollback.
CREATE TABLE IF NOT EXISTS score_idempotency (
    user_id uuid NOT NULL REFERENCES users(id),
    idempotency_key text PRIMARY KEY,
    request_path text NOT NULL,
    request_body jsonb NOT NULL,
    response_body jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);
