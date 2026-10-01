# Common Ground · 共识之地

A bilingual university peer-support community for students and staff across universities.

**Website:** https://drfrog.pages.dev

**DrFrog deployment:** Cloudflare Pages hosts the app, Cloudflare D1 stores community data, and Firebase provides verified email/password accounts. Setup and deployment instructions are in [DEPLOY-CLOUDFLARE.md](DEPLOY-CLOUDFLARE.md). The original Sites deployment is now owner-only and is not the public community address. Its database had no community profiles at cutover. No old browser data was uploaded.

## Copyright and use

© 2026 **DrFrog creators**. This is a public attribution label for the individual creators, not a separate legal entity. Legal identities are retained in private project records. Rights are reserved in their original contributions to the extent protected by applicable law. The hosted community is free to use; the original project material is not offered under an open-source licence. See [LICENSE](LICENSE) for the scope and [NOTICE](NOTICE) for provenance, AI assistance and exclusions. Third-party software and fonts retain their own licences; members' content is excluded from this ownership claim. Public GitHub viewing/forking permissions and statutory exceptions remain. Ownership shares and formal registrations are not established by these notices.

© 2026 **DrFrog 创作者**。这是个人创作者的公开署名，不是独立法律主体；法律身份保存在私人项目记录中。在适用法律保护的范围内保留原创贡献的权利。网站可免费使用；项目原创材料未授予开源许可。第三方材料保留各自许可，成员内容不属于本项目所有权主张。公开 GitHub 仓库的查看、分叉权限与法定例外不受影响。本声明不确定权利份额，也不代表已完成正式登记。

## Join the community

1. Choose **English** or **中文** in the header.
2. Select **Sign in with email → Create account**, verify your email, then click **I’ve verified my email**. Returning members use their email and password. Password recovery is available in the same dialog.
3. Choose a display name, your group (neurodivergent or neurotypical), student/staff role, and an optional university. You can also choose communication preferences; displaying those tags to other members is optional and off by default.
4. Read and agree to the community guidelines.
5. Both groups can post questions and offer help to other members. The question's author must accept before a conversation opens.
6. Send messages, share a guide, end a connection, or block/report a member.

The shared guide is available before sign-in. Interface language changes do not translate or alter members' own posts and messages. Guide references are displayed in the selected language.

## 加入社区

1. 在页首选择 **English** 或 **中文**。
2. 点击 **邮箱登录 → 注册账号**，完成邮件验证后点击 **我已验证邮箱**。已有账号可用邮箱与密码登录，也可以在同一窗口重置密码。
3. 填写昵称，选择神经多样性或神经典型群组、学生或教职员工身份；大学名称可选填。也可以选择沟通偏好，默认不向其他成员展示，是否显示标签由你决定。
4. 阅读并同意社区规则。
5. 两个群组都可以发布问题，也可以为其他成员提供帮助。只有问题发布者接受邀请后，双方才能开始对话。
6. 发送消息、分享指南、结束连接，或屏蔽与举报成员。

共享指南无需登录即可阅读。切换界面语言不会改写成员发布的问题与消息，引用的指南会随界面语言切换。

## Practical community features · 社区小帮手

1. **Communication preferences · 我的沟通偏好:** choose short replies, direct explanations, slower replies, and a preferred conversation language in **My profile**. Preferences are saved with the account but hidden from other members by default. Select **Show these tags to other members** and save to display them alongside questions, help offers, member cards and conversations. Hiding them again removes preference values from peer API responses; operators can still access the stored records.
2. **Campus toolbox · 校园工具箱:** open **Tools & ideas → Campus toolbox** for six editable bilingual message templates covering assignment instructions, feedback, deadlines, group-work roles, staff feedback preferences and university support. Copy a message and send it yourself. Drafts stay in the current open page, with separate drafts for each template and language; reloading or changing accounts clears those edits. Nothing is sent by the toolbox.
3. **What helped · 有帮助的办法:** signed-in members with completed profiles can explicitly publish a separately written experience, filter contributions by topic, delete their own contribution or report another. The member feed omits the author's name and account ID; the operator can identify the stored contribution's author for moderation. Members should omit names, contact details and identifying stories. Private chats are never automatically copied into this section. A report keeps a body/topic snapshot, which can remain after the contribution is deleted.
4. **Support choices · 你希望得到怎样的支持？:** a question can optionally ask for listening, practical suggestions, another perspective or shared experiences. The selected choice appears on the question to help responders understand the request.
5. **Campus situations · 校园情境:** five bilingual examples in **Tools & ideas → Campus situations** invite members to explore possible perspectives and clarification questions. They do not diagnose people or claim to reveal someone else's thoughts.
6. **Reading settings · 舒适阅读:** choose larger text, a plain font, one community section at a time, and automatic updates every 30, 60 or 120 seconds—or manual updates. These settings stay in that browser rather than the account. With manual updates, use the question or message **Refresh** button; the experiences feed also has its own refresh button.
7. **Questions waiting for a response · 等待回应的问题:** combine topic and status filters to find questions awaiting an active, unblocked help offer, questions still open, or resolved questions. Authors can mark a question resolved or reopen it. Resolution stops new help offers while existing conversations can continue.

The toolbox and campus situations can be explored before sign-in. Community questions, preferences shown with member records, and shared experiences require a signed-in member with a completed profile. These features use the existing hosting and database; no paid model or external AI service is connected.

## Accounts, storage and privacy

DrFrog production authentication uses Firebase email/password. The Worker validates signed Firebase ID tokens, their project/issuer/expiry, and verified email. Passwords are managed by Firebase and are never stored in the community database. The Cloudflare build ignores OpenAI identity headers. The separate legacy Sites build retains compatibility with Sites' trusted platform sign-in until explicitly reconfigured; do not host that legacy mode behind an untrusted proxy.

Profiles, communication preferences, questions and their support/status settings, offers, conversations, messages, blocks, shared experiences and reports are stored in Cloudflare D1. They survive browser reloads and are shared between the authorized accounts according to their visibility rules. Reading settings stay in the browser, and toolbox drafts stay only in the open page. The old local prototype's browser data is not uploaded into the live community.

- Only signed-in members with a completed profile can read questions and helper profiles.
- Offers are readable only by their sender and the question's author.
- Messages are readable only by the conversation's participants, with a separate operator-only path for reported conversations.
- The site operator can access stored database records. Messages are not end-to-end encrypted.
- Blocking works in both directions; ending a connection stops new messages for both people.
- University membership, staff status and group choices are self-reported. No diagnosis, student ID or email is saved in community profiles.
- The first release retains records until the operator removes them. Automated account deletion and retention schedules are not implemented.
- Reports are stored for manual review; the service does not promise immediate responses.
- Hidden communication preferences are not included in information returned to other members. Choosing to display them shares them with authorized community members, not anonymous visitors.
- Shared experiences hide the author's identity in the member feed but retain an author account reference in the database. Report snapshots can outlive a deleted experience; this is not anonymous storage from the operator.

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

The community features use the additive `drizzle/0002_community_features.sql` migration. For the current Cloudflare deployment, `src/community-features.mjs` also bootstraps the four fixed extension tables and three indexes through the existing D1 binding on the first authenticated API request. Both paths use `IF NOT EXISTS`, so applying the migration later is safe. This bootstrap does not recreate, overwrite or clear the original member, question or conversation tables; it does not accept SQL from a browser request. See the deployment guide before changing this schema or initializing a new database.

## Source layout

- `public/`: bilingual UI, guide, responsive styles, supplied frog portrait and self-hosted fonts.
- `public/features.js` and `public/campus-content.js`: communication tags, practical resource UI, editable bilingual templates, campus scenarios and browser-local reading settings.
- `src/api.mjs`: server authorization, profiles, posts, offers, messages, blocks and reports.
- `src/community-features.mjs`: preference validation/visibility and fixed additive D1 schema bootstrap for community features.
- `db/schema.ts` and `drizzle/`: database schema and generated migrations.
- `scripts/build.mjs`: Worker build; `scripts/preview.mjs`: local-only server.
- `tests/community.test.mjs`: multi-account access, consent, communication, block/report and pagination tests.
- `tests/community-features.test.mjs`: preference visibility, question support/status, waiting filters, anonymous experience feeds, report snapshots and preservation of existing data during schema bootstrap.
- `.openai/hosting.json`: the existing Site identity and logical database binding.

The requested palette is cream **#E9E0D0**, slate **#6F8097**, and terracotta **#C88972**. The supplied frog is framed as a circular logo without redrawing it. Fredoka, Comic Neue and ZCOOL KuaiLe are self-hosted with their included SIL Open Font License files.

## Validation

Automated tests cover anonymous access, incomplete onboarding, mutual participation, cross-origin writes, private offers, author-only acceptance, idempotent acceptance, participant-only messages, Chinese text, guide references, ending connections, bidirectional blocking, operator-only report review, rate limits and pagination across equal timestamps. Account tests cover secure cookies, fixed provider endpoints, session refresh, verification, recovery and abuse limits.

Community-feature tests cover hidden and displayed preferences across peer surfaces, bounded support choices, author-only resolution/reopening, waiting filters before pagination, anonymous member-facing experience responses, explicit publication consent, deletion/report review and retained report snapshots. They also exercise the runtime bootstrap against a database containing the original schema and records.

Local browser checks cover both-language onboarding, language switching with a question draft, a help offer sent from another account, author acceptance, messages, guide sharing, language persistence and responsive layouts. Production email signup, verification, profile completion and moderator access were checked with the owner's account.
