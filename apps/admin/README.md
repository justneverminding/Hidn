# HIDN Admin — reserved

This directory reserves a future standalone admin application.

Today the private moderation console (`/admin`, `/admin/reports`,
`/admin/moderators`, `/admin/audit`) is served by the main Worker in
`apps/web`, behind Cloudflare Access with role checks. It reviews reports and
hides or restores content; it must never be used to identify anonymous
members, and it has no data that could.
