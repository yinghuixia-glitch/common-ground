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

The original community schema is already applied. Do not recreate or clear the database when deploying updates. This Pages project is a direct Wrangler upload: pushing to GitHub runs validation but does not publish the site. Add migrations when the schema changes, preserving previously applied files; the fixed runtime bootstrap below supports the current additive feature release without management-API DDL access.

## Community feature update

### Primary public discussion and optional private chat

Questions now open a dedicated **Answers & open conversation** board. Each responder can create one root answer column at a time per question. Any permitted signed-in member with a verified account and completed profile can follow up directly in an accessible column, including the question's author and other responders; no invitation acceptance is required. The question's author participates through follow-ups rather than a root answer to their own question. The interface states member visibility before publication, and the API requires explicit `visibilityConsent` for each answer/comment.

Here, public discussion is community-member visible: anonymous visitors cannot read or publish questions, answers or replies. Existing private offers and chat messages remain private under their original access rules and are not imported, migrated or republished into the new board. Optional new private invitations still require acceptance before participant-only chat begins.

The waiting filter considers visible public answers as well as legacy private invitations before pagination. Only open questions with no visible root answer and no active, unblocked private invitation appear as waiting. Resolution stops new answer columns and private invitations; follow-ups in existing columns and existing private conversations can continue. Blocks apply to questions, root authors, individual commenters, pagination and counts.

Content authors can delete their own answer/comment. Deleting a root answer cascades to its follow-ups. Members can report either kind of contribution; the moderator can remove the reported root column or only the reported comment while marking the report reviewed. Moderation stores snapshots of the question title/body and answer body, plus the comment body when relevant, so removal does not destroy the report context. This does not publish private chat content.

### Frog pointer and iPad/tablet layout

`public/tablet.css` adapts the same live app at 761–1366px viewport widths: portrait/narrow layouts put the shared question panel above the secondary cards; landscape layouts give it a wide primary column with the secondary cards beside it. Header wrapping, at least 44px controls, dialogs, chat lists and resources are adjusted for tablets. Parallel discussion columns use one column below 850px, two at wider tablet widths, and one in comfort focus mode. Phone and wide-desktop layouts retain their own breakpoints.

`public/assets/frog-cursor.svg` is a static 32px sage/ink frog cursor with a 16,16 hotspot. It is applied only with fine-pointer/hover support and falls back to native cursors when unsupported. Touch keeps native behavior, while text entry/selection and disabled controls retain usable native cursors. No new service, separate tablet deployment or paid dependency is required.

### Practical resources and preferences

The bilingual release adds seven areas: optional communication tags, six editable campus message templates, separately published community experiences, four question support choices, five campus situations, browser-local reading settings, and waiting/open/resolved question filters. **Tools & ideas** contains the toolbox, situations and experiences; **My profile** contains preferences; **Reading** contains comfort controls. Both groups can continue to ask and help.

- Communication preferences default to hidden. Members must select **Show these tags to other members** and save before tags appear with their questions, public answers/follow-ups, private invitations, member cards or conversations. Hidden values, including preferred language, are omitted from peer API responses. The operator can still access the stored values in D1.
- Shared experiences require a completed profile and explicit publication consent. The member feed returns no author name or account ID, but D1 retains the author reference for operator moderation. Authors can delete their contributions; members can report them. Reports retain a body/topic snapshot after the original contribution is deleted, and operators can remove a reported contribution while resolving the report. Private conversations are not copied automatically.
- Larger text, a plain font, one-section mode and the 30/60/120-second or manual update choice are saved in that browser's local storage. They are not account preferences. Manual mode requires the relevant **Refresh** button for new questions, public discussions or private messages. Unsaved toolbox edits remain only in the currently open page. Explicit Save draft stores the selected template/language privately in the account; it can be restored from My space.
- Question support choices are optional. Only the author can resolve or reopen a question. A resolved question rejects new public answer columns and private invitations while existing follow-ups and private conversations continue. The waiting filter counts visible public answers and pending/accepted invitations from unblocked members; declined or blocked invitations do not prevent a question from appearing there.

### Additive database extension

`drizzle/0002_community_features.sql` adds four tables without altering existing community tables:

| Table | Purpose |
| --- | --- |
| `profile_preferences` | Selected communication tags, preferred language and member-visible opt-in |
| `question_features` | Optional support kind and open/resolved status |
| `takeaways` | Separately consented experiences and their author references |
| `takeaway_report_links` | Report linkage and retained body/topic snapshots |

The migration also adds three indexes on `takeaways`. On the first authenticated community API request, `ensureCommunitySchema()` in `src/community-features.mjs` issues only the fixed `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS` statements through the existing D1 `DB` binding. Readiness is cached for that binding in the Worker instance; initialization errors clear the cache so a later request can retry. No request supplies arbitrary SQL, and existing profiles, posts, offers, conversations and messages are preserved.

`drizzle/0003_public_answers.sql` and `drizzle/meta/0003_snapshot.json` add the public-discussion extension:

| Table | Purpose |
| --- | --- |
| `question_answers` | One separately consented root answer per member/question |
| `question_answer_replies` | Direct member-visible follow-ups within an answer column |
| `public_answer_report_links` | Report targets and retained question/answer/comment snapshots |

Five indexes include `answers_post_author`, a unique post/author index that prevents duplicate root columns during simultaneous requests. `ensurePublicAnswersSchema()` in `src/public-answers.mjs` runs the same fixed additive `CREATE TABLE/INDEX IF NOT EXISTS` statements through `DB` after the community-feature bootstrap on the first authenticated community API request. Readiness is cached per binding and retries after initialization failure. No existing private offer or message is changed or published by this migration/bootstrap.

This path accommodates the current Wrangler management-API DDL restriction. If migration permissions become available, applying the committed additive migration later is safe because the same tables/indexes use `IF NOT EXISTS`; record migration history through the normal migration tool rather than changing old migration files. For a new database, apply the original `0000_lethal_polaris.sql` schema first. The bootstrap creates only the extension tables, not the original community schema. The separate account rate-limit extension remains documented below.

The automated suite covers discussions, authentication, navigation, private tools, campus spaces, likes and optional email notifications. Discussion tests cover multi-member follow-ups, profile/visibility consent, preserved private content, blocks, resolution, deletion, moderator-only snapshots/removals, pagination, simultaneous root submissions, rate limits and additive migration/bootstrap. Authentication checks cover bounded verification-confirmation refresh, account-identity preservation and email-specific quota errors. Navigation tests cover visitor/member defaults, participation/question links, tool routes and invalid links. Tests use local fictional identities. Real-member production verification should be recorded separately from fixture checks.

The homepage/navigation release needs no database migration or Firebase setting change. Anonymous visitors start at `#home`, completed members at `#community`, and explicit question/tool/participation links take precedence. Tools and guides are publicly readable; member content remains protected by the existing API. Desktop/tablet use top navigation and phones use the same four destinations in a bottom bar. Local mocked-provider checks confirmed that login, pasted email verification and profile completion resume the original question, plus refresh/history behavior and sign-out cleanup.

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

The browser calls only `/api/auth/*` on DrFrog. The Cloudflare Worker calls a fixed allowlist of Firebase REST operations, forwards passwords over HTTPS without storing or logging them, and keeps ID/refresh tokens in Secure, HttpOnly, host-only cookies. Existing Firebase user IDs, passwords and community profiles are retained; members who used the previous browser SDK should sign in again after this update. The browser connection policy permits only the site itself. This removes direct browser requests to Google. A member has reported successful QQ registration, but mailbox accessibility, message delivery and opening the verification page are separate stages; mainland China behavior still needs checks on the affected user's network.

**Verification state refresh:** the verification panel checks when an unverified member returns to the visible/focused tab, with a 10-second recheck guard. The **Check verification & continue** button requests `/api/auth/session` with `verificationCheck: true`. The server refreshes the session and performs an authoritative account lookup; if that lookup confirms verification, it performs one further token refresh and lookup before returning the verified session. A changed identity, disabled account or lost verification fails closed. This is bounded and never treats browser state as proof of verification. A read-only `/api/me` response of `verifyEmail` can invoke this check and retry that read once; writes are not replayed. Already-verified accounts do not need another verification email.

**Delivery feedback:** the verification panel shows the current email, a prominent first-party paste-link route and inbox/spam/address troubleshooting. A successful send request is described as requested, not delivered. The resend button has a 60-second UI cooldown; existing server and Firebase abuse/quota limits still apply, and email-specific quota errors do not imply that ordinary sign-in is unavailable. If a member cannot access their mailbox service locally, another accessible address may be used for a new account; this does not migrate their existing profile or messages.

The provider transport uses the native global fetch receiver and `redirect: 'manual'`, rejecting every 3xx response rather than following credentials to another URL. This was checked on the live Worker after its runtime rejected `redirect: 'error'`. Authentication failures may return a closed set of diagnostic labels/status codes; raw provider error messages, passwords, tokens and email links are never echoed or logged. Live tests with an invalid test login and an invented email code confirmed provider responses without creating accounts or sending emails. A local browser review used invented members only; real production posts were not captured in screenshots.

The additive `0001_auth_limits.sql` migration adds only rate-limit counters with hashed IP/window keys, expiring after 15 minutes and purged on subsequent account requests. The Worker also initializes this fixed table/index through the existing D1 binding on its first account request, so signup does not depend on Wrangler management-API DDL permissions. Both bootstrap and migration use `IF NOT EXISTS`; running the migration later is safe. Cloudflare's management API denied the migration-list initialization with error 7403 during this update despite the existing D1 OAuth scope, so this release uses the binding bootstrap. No account password or community record is stored in that table. Account requests are limited per IP; sessions have a separate allowance. The server also keeps existing post/message abuse limits and consent/block/privacy rules.

For email links to open directly on DrFrog, in Firebase **Authentication → Templates**, edit an email template, choose **Customize action URL**, and set **https://drfrog.pages.dev/**. Firebase's custom handler receives `mode` and `oobCode`; the app supports email verification and password resets and clears these parameters from the address bar before further requests. No service-account credential is needed by the app. The owner must save this console setting; deploying the app does not change Firebase email templates.

**Current operator status:** the owner reports that email links still use the default `firebaseapp.com` handler and saving the custom action URL gives **“An error occurred when updating action URL”**. A read-only Firebase project check confirmed that `drfrog.pages.dev` is authorized; the custom action URL has not been confirmed saved. The generic console error has not been diagnosed. Retain the existing paste-link path while requesting Firebase support for this configuration error. Include the project ID, attempted action URL and error text in the support request; do not share passwords, tokens or users' email links. Do not upgrade billing or enable a new SMTP provider automatically to work around this error.

Until that setting is saved (and for old emails), members can select **Email link won’t open? Verify or reset here**, copy the full verification/reset link from their own email, and paste it into the dialog. This applies the code through the same first-party endpoint and does not require opening `firebaseapp.com`. Verification is never skipped. New password submission requires an email reset code; applying a verification code does not sign in the email recipient.

Primary documentation: [Firebase REST API](https://firebase.google.com/docs/reference/rest/auth), [custom email action handlers](https://firebase.google.com/docs/auth/custom-email-handler), [Firebase support](https://firebase.google.com/support).

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
6. Add the assigned Pages hostname to Firebase's authorized domains. Check signup → verification → profile → question → independent public answer columns → direct follow-ups using at least three permitted accounts. Also check the optional private invitation/acceptance/message route and the moderator report queue. Record which checks use local fixtures and which use real production accounts.

GitHub integration automatically deploys main-branch updates after this setup. The generated `_worker.js` contains the backend; static GitHub Pages cannot replace it. Cloudflare mode always requires Firebase configuration and fails closed when missing.

## Existing community data

Before cutover, inspect the old database for real profiles/posts/messages. If populated, plan a reviewed data migration and account linking. A matching display name is not proof of identity. Firebase account IDs deliberately have a separate namespace, and this setup does not silently migrate or delete existing records. Keep the old deployment until migration and the new sign-in are verified.

## Cost and limits

Members are never charged by this app. Use Cloudflare's free tier and Firebase's Spark plan; no custom domain, paid LLM, or upgrade is required for this setup. Both providers impose quotas, and email delivery can reach limits. This is not unlimited hosting.

Primary documentation: [Cloudflare Git integration](https://developers.cloudflare.com/pages/get-started/git-integration/), [Pages advanced Worker mode](https://developers.cloudflare.com/pages/functions/advanced-mode/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), [Firebase email/password](https://firebase.google.com/docs/auth/web/password-auth), [Firebase limits](https://firebase.google.com/docs/auth/limits), [Firebase pricing](https://firebase.google.com/pricing).


## Private tools and campus observations

Migration `0004_wellbeing_tools.sql` adds owner-private drafts/bookmarks/plans, rate counters, campus observations and retained report snapshots. Fixed helpers initialize the additive extension on relevant routes through D1; no previous record is replaced. Calendar files are generated locally and require import into a calendar. No Firebase setting or paid integration is needed.


### Likes and optional reply email

Questions and root answers have idempotent per-member likes. Counts exclude mutually blocked members; liker rosters are not exposed, and likes do not reorder the feed. The additive migration `0005_reactions.sql` matches the runtime bootstrap.

Reply email is off by default for every member and for an unconfigured site. **My profile → Reply email reminders** lets a member explicitly opt in. Only the authenticated, verified account email is saved; an opt-out clears that address. Brevo receives the address and a generic bilingual link, without question, answer, profile or private message text. Notifications are only for the question owner on another member's public answer/follow-up, with self/blocked/deleted events suppressed. Likes and private messages do not send emails.

The persistent outbox caps delivery attempts at 200/day by default (never above 200), leaving room within Brevo's 300/day free allowance; other Brevo uses share its allowance. Per-owner/question cooldown limits mail to once per hour. Concurrent claims are guarded. Only explicit HTTP 429 rejection retries, up to three provider attempts; transport ambiguity is terminal to avoid duplicate sends. A provider request already handed off cannot be recalled by opt-out. Pending events are retried on later authenticated activity, with no paid cron or queue; reminders can be delayed and delivery is not guaranteed. Terminal event metadata is pruned after 30 days and unsubscribe tokens after 90 days on delivery activity.

Unsubscribe links contain random capability tokens, hashed in the database. GET shows confirmation, POST opts out. No sign-in is required, and email-link scanners cannot opt someone out simply by opening a link. The `0006_reply_notifications.sql` migration is additive; no mail content or provider key is returned by the API.

### Free Brevo configuration

Keep Brevo on its Free plan and verify the sender address. Generate an **API key** (not an SMTP key) in Brevo's SMTP & API settings. Copy it directly into the Cloudflare Pages project's Production Variables and Secrets as the encrypted secret `BREVO_API_KEY`. Never put the key into Git, browser assets, chat or an ordinary public variable. Set `NOTIFICATION_FROM_EMAIL` to the verified sender and `NOTIFICATION_ENABLED` to `1` in the ignored Wrangler production configuration, then redeploy. Leave these settings unset to keep mail off. A provider quota or rejection never turns a successfully published answer into a publication error. Validate with consenting real accounts separately from mocked-provider tests.

## Campus support, quiet study and private agreements

The release adds `0007_study_rooms.sql`, `0008_group_agreements.sql` and `0009_university_support.sql` with matching schema snapshots/journal entries. Existing production tables are preserved. Fixed runtime helpers bootstrap only the relevant extension on first access with `IF NOT EXISTS`; applying the same additive migration later is safe. The directory seeds eight immutable IDs using one 96-binding INSERT OR IGNORE, so operator edits/archives survive future deploys. No extra binding, paid queue, LLM or account is required.

Directory GET is public and bypasses Firebase, including client token refresh. Suggestion and manager routes require a verified completed profile; only the configured moderator manages entries/reviews suggestions. Source HTTPS URLs and actual review dates must be confirmed in the bilingual editor. Review status alone never publishes a service.

Study-room/report routes require verified completed profiles. Rooms have eight-member capacity, participant-only private goal/chat access, optional explicit sharing and reporting. Study reports appear inside Tools → Quiet study companions, separate from the community report dialog. Group routes require invited membership; private group data has no moderator override endpoint. Codes are hashed capabilities, expire after seven days, and may be revoked. Both groups and rooms respect bidirectional blocks. All exit/creator cleanup operations remain possible after blocking.

Runtime bootstraps plus existing core schema remain below the free D1 50-query-per-invocation cap. Visible study panes poll every 30–60 seconds and render the timer locally; inactive tabs and manual-refresh users do not poll. Directory/group data is read on relevant actions, not every keystroke. Calendar files are generated in the browser and require manual import. Free quotas still apply; this release does not change billing or promise unlimited capacity. Only the current Cloudflare Pages project is published; the previous ChatGPT Site stays private.
