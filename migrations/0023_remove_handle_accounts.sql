-- Remove the retired handle accounts and everything tied to them.
-- Posts and replies they wrote stay up, unlinked from any account, so they
-- become nameless like the rest of the room. Their sessions, login
-- challenges, likes, account notifications and payment records go.

-- Keep the content; drop the link to an account.
UPDATE hidn_threads SET author_user_id = NULL WHERE author_user_id IS NOT NULL;
UPDATE hidn_replies SET author_user_id = NULL WHERE author_user_id IS NOT NULL;
UPDATE hidn_reports SET reporter_user_id = NULL WHERE reporter_user_id IS NOT NULL;

-- Likes, notifications and login state belonged to the accounts themselves.
DELETE FROM hidn_reactions WHERE actor_user_id IS NOT NULL;
DELETE FROM hidn_notifications;
DELETE FROM hidn_auth_challenges;
DELETE FROM hidn_sessions;
DELETE FROM payment_events;
DELETE FROM payment_intents;

DELETE FROM hidn_users;
