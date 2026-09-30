# DrFrog: independent hosting and email accounts

Prepared code; the independent production deployment still requires the owner's Firebase and Cloudflare project configuration. The existing Sites address continues working during setup. `drfrog.pages.dev` is a proposed name, subject to availability.

## 1. Firebase (Spark plan)

1. Create/open the DrFrog project at https://console.firebase.google.com/ and keep the free Spark plan.
2. Authentication → Get started → Sign-in method → Email/Password: enable Email/Password. Email-link sign-in is not needed.
3. Project settings → General → Your apps → Web (`</>`): register **DrFrog Web**. Firebase Hosting is not required.
4. Copy the public web configuration: `apiKey`, `projectId`, `appId`, `authDomain`. Do not supply a service-account private key or your password.
5. Authentication → Settings → Password policy: set minimum length to 8. The app form also requires 8 characters.
6. Authentication → Templates: set the app name to DrFrog for verification/reset emails. The app requests emails in the selected Chinese/English language.
7. After Cloudflare assigns the final hostname, add that exact hostname under Authentication → Settings → Authorized domains. For local Firebase testing, add `127.0.0.1` separately; newly created projects may not authorize localhost automatically.

Users create an email/password account, verify their email, and complete the existing bilingual community onboarding. Firebase handles passwords, verification, and password-reset delivery. The server validates signed Firebase ID tokens and requires verified email. It ignores OpenAI identity headers on the independent host. No Google or ChatGPT account is required for community members.

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
