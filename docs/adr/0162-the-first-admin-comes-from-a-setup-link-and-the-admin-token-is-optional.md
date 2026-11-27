# The first admin comes from a setup link, and the admin token is optional

2026-11-27 (mattpocock/cookout#913, spec mattpocock/cookout#900). Amends [ADR 0032](0032-the-admin-token-is-a-required-setting.md), which made `COOKOUT_ADMIN_TOKEN` required, and [ADR 0130](0130-boot-applies-the-admin-token-only-when-the-setting-changes.md), which still applies when the setting is set.

## Context

ADR 0032 made `COOKOUT_ADMIN_TOKEN` required so a board could never be left without a way in. Running a cookout then meant making a 32-character secret before the first boot, and a person who wanted a browser session still had to paste that token somewhere. Spec #900 moves the way in to the server console: whoever can run commands where `cookout serve` runs can set up the first admin and log anyone in, with no token to keep.

## Decision

- **`COOKOUT_ADMIN_TOKEN` is optional.** Unset or empty, boot starts normally and applies no admin setting. Set, it must still be at least 32 characters (`admin_token_invalid` otherwise), and boot applies it exactly as ADR 0130 says. `COOKOUT_ADMIN_NAME` only matters when the token is set.
- **A setup link while the store has no admin.** While the store has no active admin, each `cookout serve` boot prints one JSON line `{"expiresAt", "setupLink"}`, before its `listening` line. The link is `<board>/#/setup-link/<secret>`, where the board is `COOKOUT_PUBLIC_URL` when set and the listening address otherwise. It lasts 24 hours, and a new one replaces any earlier one: the store keeps one setup link at most, by its secret's hash. Once an admin exists, boot prints nothing about it.
- **Redeeming it makes the first admin.** `POST /v1/setup-links/redeem` (no token, behind the per-address request limit) takes the secret, a `name` and an optional `displayName`. In one storage operation it checks the link and that there is still no admin, creates that human as an admin, uses the link up and makes a web session, which is set as the session cookie. A Login alert for the new web session follows, as for any login. A used, expired, replaced or unknown link, or any link once an admin exists, is 404 `setup_link_not_found`; a taken name is 409 `identity_exists`, and the link still works. The web page at `#/setup-link/<secret>` asks for the name and display name and then opens the inbox.
- **`cookout admin` runs on the server's own store.** It reads the same database settings as `serve` (`DATABASE_URL`, else `--db`/`COOKOUT_DB`, plus `COOKOUT_SECRETS_KEY`) and needs no running server and no session. `cookout admin setup-link` prints a fresh setup link while no admin exists (replacing any earlier one) and refuses with `admin_exists` once one does. `cookout admin login-link <name>` prints `{"expiresAt", "loginLink"}`, a 15-minute one-time login link for that person, which is a root in the credential lineage. An unknown name is `identity_not_found` and an agent `human_only`, both exiting 1.
- **The server console is named in the Login alert.** The admin-act alert's `admin` is optional: absent, the act came from the server console, and the web shows "The server console acted on your credentials".

## Considered options

- **Keep the token required and add the console commands beside it**: rejected. It keeps the secret every new cookout must make before it can boot, which the console makes unnecessary.
- **Print the setup link only on the first boot ever**: rejected. A link lost from the logs would then leave a board with no way in; printing a fresh one each boot without an admin, and on demand, avoids that.

## Consequences

- A cookout with no token and no admin is open only to whoever sees its boot logs or can run `cookout admin` on its host. On Fly that is `fly logs` and `fly ssh console -a cookout -C "cookout admin login-link <name>"`.
- A deployment that sets `COOKOUT_ADMIN_TOKEN` behaves as before, so the deployed board and CI keep working with no change.
