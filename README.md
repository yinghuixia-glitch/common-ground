# Common Ground · 共同点

A bilingual university peer-support community for students and staff across universities.

**Website:** https://drfrog.pages.dev

**DrFrog deployment:** Cloudflare Pages hosts the app, Cloudflare D1 stores community data, and Firebase provides verified email/password accounts. Setup and deployment instructions are in [DEPLOY-CLOUDFLARE.md](DEPLOY-CLOUDFLARE.md). The original Sites address remains available during transition. Its database had no community profiles at cutover. No old browser data was uploaded.

## Join the community

1. Choose **English** or **中文** in the header.
2. Select **Sign in with email → Create account**, verify your email, then click **I’ve verified my email**. Returning members use their email and password. Password recovery is available in the same dialog.
3. Choose a display name, your group (neurodivergent or neurotypical), student/staff role, and an optional university.
4. Read and agree to the community guidelines.
5. Neurodivergent members can post questions. Neurotypical members can send help offers. The question's author must accept before a conversation opens.
6. Send messages, share a guide, end a connection, or block/report a member.

The shared guide is available before sign-in. Interface language changes do not translate or alter members' own posts and messages. Guide references are displayed in the selected language.

## 加入社区

1. 在页首选择 **English** 或 **中文**。
2. 点击 **邮箱登录 → 注册账号**，完成邮件验证后点击 **我已验证邮箱**。已有账号可用邮箱与密码登录，也可以在同一窗口重置密码。
3. 填写昵称，选择神经多样性或神经典型群组、学生或教职员工身份；大学名称可选填。
4. 阅读并同意社区规则。
5. 神经多样性成员可以发布问题；神经典型成员可以发送帮助邀请。只有问题发布者接受后，双方才能开始对话。
6. 发送消息、分享指南、结束连接，或屏蔽与举报成员。

共享指南无需登录即可阅读。切换界面语言不会改写成员发布的问题与消息，引用的指南会随界面语言切换。

## Accounts, storage and privacy

DrFrog production authentication uses Firebase email/password. The Worker validates signed Firebase ID tokens, their project/issuer/expiry, and verified email. Passwords are managed by Firebase and are never stored in the community database. The Cloudflare build ignores OpenAI identity headers. The separate legacy Sites build retains compatibility with Sites' trusted platform sign-in until explicitly reconfigured; do not host that legacy mode behind an untrusted proxy.

Profiles, questions, offers, conversations, messages, blocks and reports are stored in Cloudflare D1. They survive browser reloads and are shared between the authorized accounts. The old local prototype's browser data is not uploaded into the live community.

- Only signed-in members with a completed profile can read questions and helper profiles.
- Offers are readable only by their sender and the question's author.
- Messages are readable only by the conversation's participants, with a separate operator-only path for reported conversations.
- The site operator can access stored database records. Messages are not end-to-end encrypted.
- Blocking works in both directions; ending a connection stops new messages for both people.
- University membership, staff status and group choices are self-reported. No diagnosis, student ID or email is saved in community profiles.
- The first release retains records until the operator removes them. Automated account deletion and retention schedules are not implemented.
- Reports are stored for manual review; the service does not promise immediate responses.

The owner can open **My profile → Report queue** after joining. The moderator is configured through the private production variable `MODERATOR_EMAIL`, matched against the verified Firebase sign-in email. It is not inferred from the member's self-selected staff role. The owner can also view database records through Cloudflare D1.

## Cost and hosting

The app has no charges to members, payments or paid model integration. Hosting is configured for Cloudflare's free tier and Firebase's Spark plan; no custom domain was purchased. Firebase's public web API key identifies the project and is not an LLM billing key. Provider availability and quotas still apply. This is an early community release, not a promise of unlimited hosting forever.

GitHub holds the source code. GitHub Pages alone cannot run the account and messaging backend. DrFrog is deployed through Cloudflare Wrangler. Cloudflare's attempted GitHub connection returned error 8000011, so the current project uses Direct Upload. The GitHub workflow validates both hosting builds but does not automatically deploy them. Publish updates with the authenticated Wrangler CLI; automatic deployment would require a separately configured CI credential or another Git-integrated Pages project.

## Shared guide

The free searchable guide has original English and Chinese conversation prompts, practical university examples, and source links. It is a starting point for peer conversation, not clinical guidance or a university policy database. Autism-specific resources are labelled and do not represent every neurodivergent experience. No LLM is connected in this release.

Sources include the National Autistic Society and University of Washington Disability Resources for Students.

## Local development

Requires Node.js 24 or newer (the preview/test adapter uses `node:sqlite`).

```sh
npm ci
npm test
npm run dev
```

Open http://127.0.0.1:4173. The local sign-in page offers Alice, Bob and Eve as development identities. These exist only in `scripts/preview.mjs`; they are not included in the deployed Worker. Local data is stored in ignored `.local/community.sqlite`. No production records or credentials are copied to the repository.

`npm run build` generates `dist/server/index.js`, including the frontend assets, and a deployment manifest. Sites packaging includes the generated Drizzle migrations. Schema changes belong in `db/schema.ts`; run `npm run db:generate` and inspect the SQL. Once a migration has been applied in production, preserve it and append new migrations.

## Source layout

- `public/`: bilingual UI, guide, responsive styles, supplied frog portrait and self-hosted fonts.
- `src/api.mjs`: server authorization, profiles, posts, offers, messages, blocks and reports.
- `db/schema.ts` and `drizzle/`: database schema and generated migrations.
- `scripts/build.mjs`: Worker build; `scripts/preview.mjs`: local-only server.
- `tests/community.test.mjs`: multi-account access, consent, communication, block/report and pagination tests.
- `.openai/hosting.json`: the existing Site identity and logical database binding.

The requested palette is cream **#E9E0D0**, slate **#6F8097**, and terracotta **#C88972**. The supplied frog is framed as a circular logo without redrawing it. Fredoka and Comic Neue are bundled under the included SIL Open Font License files; Chinese uses available system fonts.

## Validation

Automated tests cover anonymous access, incomplete onboarding, group permissions, cross-origin writes, private offers, author-only acceptance, idempotent acceptance, participant-only messages, Chinese text, guide references, ending connections, bidirectional blocking, operator-only report review, rate limits and pagination across equal timestamps.

Local browser checks cover both-language onboarding, language switching with a question draft, a help offer sent from another account, author acceptance, messages, guide sharing, language persistence and responsive layouts. Production publishing is verified through the hosting platform. External ChatGPT sign-in still needs a real visitor's first-run check.
