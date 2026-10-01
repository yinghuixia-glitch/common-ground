# DrFrog: independent hosting and email accounts

**Live:** https://drfrog.pages.dev. Firebase project: `drfrog-447b8`. Cloudflare Pages project: `drfrog`. D1 database: `common-ground-drfrog`, binding `DB`. The owner added the production hostname to Firebase's authorized domains. The original Sites deployment is now owner-only and had no community profiles at cutover.

Cloudflare rejected its GitHub integration with error 8000011. The production project therefore uses **Direct Upload** through Wrangler; GitHub contains the source and validates changes. The Git integration steps below are for a fresh project if that connection is repaired. They do not describe the current project's deployment mechanism.

## Publish updates to the current project

Copy `wrangler.example.jsonc` to ignored `wrangler.jsonc`, set the Firebase public identifiers, and set D1 database ID to `bec0a764-9ef5-431b-b1b0-23dfe029691b`. Authenticate Wrangler to the owner's Cloudflare account. Keep `MODERATOR_EMAIL` as a production secret in the Pages dashboard. Build, then publish:

```sh
npm ci
npm test
npm run build:cloudflare
node scripts/check-cloudflare.mjs
npx wrangler pages deploy cloudflare-dist --project-name drfrog --branch main
```

The existing D1 migration is already applied. Do not recreate or clear the database when deploying updates. Add and apply new migrations only when the schema changes.

## 1. Firebase (Spark plan)

1. Create/open the DrFrog project at https://console.firebase.google.com/ and keep the free Spark plan.
2. Authentication → Get started → Sign-in method → Email/Password: enable Email/Password. Email-link sign-in is not needed.
3. Project settings → General → Your apps → Web (`</>`): register **DrFrog Web**. Firebase Hosting is not required.
4. Copy the public web configuration: `apiKey`, `projectId`, `appId`, `authDomain`. Do not supply a service-account private key or your password.
5. Authentication → Settings → Password policy: set minimum length to 8. The app form also requires 8 characters.
6. Authentication → Templates: set the app name to DrFrog for verification/reset emails. The app requests emails in the selected Chinese/English language.
7. After Cloudflare assigns the final hostname, add that exact hostname under Authentication → Settings → Authorized domains. For local Firebase testing, add `127.0.0.1` separately; newly created projects may not authorize localhost automatically.

Users create an email/password account, verify their email, and complete the existing bilingual community onboarding. Firebase handles passwords, verification, and password-reset delivery. The server validates signed Firebase ID tokens and requires verified email. It ignores OpenAI identity headers on the independent host. No Google or ChatGPT account is required for community members.

## Accounts on networks that cannot reach Google

The browser now calls only `/api/auth/*` on DrFrog. The Cloudflare Worker calls a fixed allowlist of Firebase REST operations, forwards passwords over HTTPS without storing or logging them, and keeps ID/refresh tokens in Secure, HttpOnly, host-only cookies. Existing Firebase user IDs, passwords and community profiles are retained; members who used the previous browser SDK should sign in again after this update. The browser connection policy permits only the site itself. This removes direct browser requests to Google; mainland China delivery still needs a real network test, and email delivery/provider quotas still apply.

The additive `0001_auth_limits.sql` migration adds only rate-limit counters with hashed IP/window keys, expiring after 15 minutes and purged on subsequent account requests. The Worker also initializes this fixed table/index through the existing D1 binding on its first account request, so signup does not depend on Wrangler management-API DDL permissions. Both bootstrap and migration use `IF NOT EXISTS`; running the migration later is safe. Cloudflare's management API denied the migration-list initialization with error 7403 during this update despite the existing D1 OAuth scope, so this release uses the binding bootstrap. No account password or community record is stored in that table. Account requests are limited per IP; sessions have a separate allowance. The server also keeps existing post/message abuse limits and consent/block/privacy rules.

For email links to open directly on DrFrog, in Firebase **Authentication → Templates**, edit an email template, choose **Customize action URL**, and set **https://drfrog.pages.dev/**. Firebase's custom handler receives `mode` and `oobCode`; the app supports email verification and password resets and clears these parameters from the address bar before further requests. No service-account credential is needed by the app. The owner must save this console setting; deploying the app does not change Firebase email templates.

Until that setting is saved (and for old emails), members can select **Email link won’t open? Verify or reset here**, copy the full verification/reset link from their own email, and paste it into the dialog. This applies the code through the same first-party endpoint and does not require opening `firebaseapp.com`. Verification is never skipped. New password submission requires an email reset code; applying a verification code does not sign in the email recipient.

Primary documentation: [Firebase REST API](https://firebase.google.com/docs/reference/rest/auth), [custom email action handlers](https://firebase.google.com/docs/auth/custom-email-handler).

## 2. Cloudflare Pages (free account)

1. Workers & Pages → Create application → Pages → Connect to Git. Authorize the owner's repository `yinghuixia-glitch/common-ground`.
2. Project name: **drfrog**, if available. Production branch: `main`. Framework preset: None. Build command: `npm run build:cloudflare`. Output directory: `cloudflare-dist`. Root directory: leave blank.
3. Set `NODE_VERSION` to `24` for builds. Add these runtime variables in Settings → Variables and Secrets (production):

| Variable | Value |
| --- | --- |
| `AUTH_PROVIDER` | `firebase` |
| `FIREBASE_PROJECT_ID` | Firebase `projectId` |
| `FIREBASE_API_KEY` | Firebase public `apiKey` |
| `FIREBASE_APP_ID` | Firebase `appId` |
| `MODERATOR_EMAIL` | Owner's verified Firebase account email; use a secret |

4. Storage & databases → D1: create **common-ground-drfrog**. Pages project → Settings → Bindings: add the database with binding name **DB**. Redeploy after changing runtime variables/bindings.
5. Apply the committed migration before admitting members. With Wrangler authenticated to the owner's Cloudflare account, either use the example configuration (replace its placeholders) and `npx wrangler d1 migrations apply common-ground-drfrog --remote`, or run the SQL from `drizzle/0000_lethal_polaris.sql` in the new D1 database console. Apply it once to the new database; do not alter applied migrations.
6. Add the assigned Pages hostname to Firebase's authorized domains. Confirm signup → verification → profile → question → accepted help offer → messages using two accounts, and confirm the moderator report queue.

GitHub integration automatically deploys main-branch updates after this setup. The generated `_worker.js` contains the backend; static GitHub Pages cannot replace it. Cloudflare mode always requires Firebase configuration and fails closed when missing.

## Existing community data

Before cutover, inspect the old database for real profiles/posts/messages. If populated, plan a reviewed data migration and account linking. A matching display name is not proof of identity. Firebase account IDs deliberately have a separate namespace, and this setup does not silently migrate or delete existing records. Keep the old deployment until migration and the new sign-in are verified.

## Cost and limits

Members are never charged by this app. Use Cloudflare's free tier and Firebase's Spark plan; no custom domain, paid LLM, or upgrade is required for this setup. Both providers impose quotas, and email delivery can reach limits. This is not unlimited hosting.

Primary documentation: [Cloudflare Git integration](https://developers.cloudflare.com/pages/get-started/git-integration/), [Pages advanced Worker mode](https://developers.cloudflare.com/pages/functions/advanced-mode/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), [Firebase email/password](https://firebase.google.com/docs/auth/web/password-auth), [Firebase limits](https://firebase.google.com/docs/auth/limits), [Firebase pricing](https://firebase.google.com/pricing).
