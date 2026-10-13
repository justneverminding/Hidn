-- Stop content from being groupable by member.
-- Posts, replies and likes used to store the member's alias, and posts and
-- replies a notification fingerprint shared by all of one member's content.
-- New content uses a one-off notification key per post and no alias; this
-- clears the old links. Old notification fingerprints are no longer queried
-- by any client, so the notifications addressed to them are removed too.

UPDATE hidn_threads
SET anonymous_alias = NULL,
    anonymous_notification_capability_hash = NULL
WHERE anonymous_alias IS NOT NULL
   OR anonymous_notification_capability_hash IS NOT NULL;

UPDATE hidn_replies
SET anonymous_alias = NULL,
    anonymous_notification_capability_hash = NULL
WHERE anonymous_alias IS NOT NULL
   OR anonymous_notification_capability_hash IS NOT NULL;

UPDATE hidn_reactions
SET anonymous_alias = NULL
WHERE anonymous_alias IS NOT NULL;

DELETE FROM hidn_anonymous_notifications;
