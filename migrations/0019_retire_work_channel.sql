-- Retire the Work channel and remove its stored room content.
-- The replacement channel is THE UNDERGROUND; existing Work posts should not
-- silently reappear there under a different label.

DELETE FROM hidn_reactions
WHERE target_id IN (
  SELECT thread_id
  FROM hidn_threads
  WHERE channel = 'work'
  UNION ALL
  SELECT r.reply_id
  FROM hidn_replies r
  JOIN hidn_threads t ON t.thread_id = r.thread_id
  WHERE t.channel = 'work'
);

DELETE FROM hidn_notifications
WHERE target_id IN (
  SELECT thread_id
  FROM hidn_threads
  WHERE channel = 'work'
  UNION ALL
  SELECT r.reply_id
  FROM hidn_replies r
  JOIN hidn_threads t ON t.thread_id = r.thread_id
  WHERE t.channel = 'work'
);

DELETE FROM hidn_anonymous_notifications
WHERE thread_id IN (
  SELECT thread_id
  FROM hidn_threads
  WHERE channel = 'work'
)
OR target_id IN (
  SELECT thread_id
  FROM hidn_threads
  WHERE channel = 'work'
  UNION ALL
  SELECT r.reply_id
  FROM hidn_replies r
  JOIN hidn_threads t ON t.thread_id = r.thread_id
  WHERE t.channel = 'work'
);

DELETE FROM hidn_reports
WHERE target_id IN (
  SELECT thread_id
  FROM hidn_threads
  WHERE channel = 'work'
  UNION ALL
  SELECT r.reply_id
  FROM hidn_replies r
  JOIN hidn_threads t ON t.thread_id = r.thread_id
  WHERE t.channel = 'work'
);

DELETE FROM hidn_replies
WHERE thread_id IN (
  SELECT thread_id
  FROM hidn_threads
  WHERE channel = 'work'
);

DELETE FROM hidn_threads
WHERE channel = 'work';
