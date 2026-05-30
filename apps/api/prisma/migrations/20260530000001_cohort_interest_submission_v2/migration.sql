-- OWAMBE-INTEREST-CAPTURE-HARDENING-01
-- v2 lead infrastructure: DB persistence for cohort interest submissions
-- Operational model shift: "DB is persistence; email is notification"
-- Adds cohort_interest_submissions table with source tagging + email status flags

CREATE TABLE IF NOT EXISTS "cohort_interest_submissions" (
  "id"                    TEXT          NOT NULL,
  "email"                 VARCHAR(255)  NOT NULL,
  "source"                VARCHAR(50)   NOT NULL,
  "submitted_at"          TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ip_address"            VARCHAR(45),
  "user_agent"            VARCHAR(500),
  "email_forward_status"  VARCHAR(20),
  "ack_email_status"      VARCHAR(20),

  CONSTRAINT "cohort_interest_submissions_pkey" PRIMARY KEY ("id")
);

-- Deduplication + query indexes
CREATE INDEX IF NOT EXISTS "cohort_interest_submissions_email_source_idx"
  ON "cohort_interest_submissions" ("email", "source");

CREATE INDEX IF NOT EXISTS "cohort_interest_submissions_submitted_at_idx"
  ON "cohort_interest_submissions" ("submitted_at");
