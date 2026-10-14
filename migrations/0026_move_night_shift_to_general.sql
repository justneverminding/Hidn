-- Retire the Night Shift room. Its posts are kept and move to General, so
-- nothing anyone wrote disappears; replies, likes and reports follow their
-- posts by id and need no change.

UPDATE hidn_threads
SET channel = 'general'
WHERE channel = 'night-shift';
