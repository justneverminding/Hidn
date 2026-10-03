-- Optional second factor for revealing a browser-held recovery key.
-- Answers are stored only as hashes; question text is retained so the account
-- owner can be prompted again during a later recovery-key reveal.

ALTER TABLE hidn_users ADD COLUMN recovery_question_1 TEXT;
ALTER TABLE hidn_users ADD COLUMN recovery_answer_1_hash TEXT;
ALTER TABLE hidn_users ADD COLUMN recovery_question_2 TEXT;
ALTER TABLE hidn_users ADD COLUMN recovery_answer_2_hash TEXT;
