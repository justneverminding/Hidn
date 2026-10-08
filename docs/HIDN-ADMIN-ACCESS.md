# HIDN administration

HIDN protects its administrative controls with Cloudflare Access and server-side role checks. The Worker validates the authenticated Access identity before allowing moderation or administration actions.

Cloudflare Access is fail-closed for administrator routes. The legacy bearer-token
path is disabled unless the Worker variable `ALLOW_LEGACY_ADMIN_TOKEN=true` is
set deliberately during a short migration window. `REPORT_ADMIN_TOKEN` alone
does not enable administrator access.

Administrative credentials and deployment configuration are stored outside source control. Do not add access tokens, audience values, administrator identities, private keys, or environment files to this repository.

The public application remains available to ordinary visitors, while administrative actions require an authorized operator session. Sensitive audit data and role-management records are restricted to authorized administrators.

For deployment and operator setup, use the private deployment notes rather than publishing infrastructure details in this repository.
