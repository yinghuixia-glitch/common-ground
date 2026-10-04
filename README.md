# Common Ground · 共识之地

A bilingual university peer-support community for students and staff across universities.

**Website:** https://drfrog.pages.dev

**DrFrog deployment:** Cloudflare Pages hosts the app, Cloudflare D1 stores community data, and Firebase provides verified email/password accounts. Setup and deployment instructions are in [DEPLOY-CLOUDFLARE.md](DEPLOY-CLOUDFLARE.md). The original Sites deployment is now owner-only and is not the public community address. Its database had no community profiles at cutover. No old browser data was uploaded.

## Copyright and use

© 2026 **DrFrog creators**. This is a public attribution label for the individual creators, not a separate legal entity. Legal identities are retained in private project records. Rights are reserved in their original contributions to the extent protected by applicable law. The hosted community is free to use; the original project material is not offered under an open-source licence. See [LICENSE](LICENSE) for the scope and [NOTICE](NOTICE) for provenance, AI assistance and exclusions. Third-party software and fonts retain their own licences; members' content is excluded from this ownership claim. Public GitHub viewing/forking permissions and statutory exceptions remain. Ownership shares and formal registrations are not established by these notices.

© 2026 **DrFrog 创作者**。这是个人创作者的公开署名，不是独立法律主体；法律身份保存在私人项目记录中。在适用法律保护的范围内保留原创贡献的权利。网站可免费使用；项目原创材料未授予开源许可。第三方材料保留各自许可，成员内容不属于本项目所有权主张。公开 GitHub 仓库的查看、分叉权限与法定例外不受影响。本声明不确定权利份额，也不代表已完成正式登记。

## Home and navigation · 首页与导航

The bilingual public homepage introduces the community and offers three starting points: ask a question, respond to a question, and explore tools/guides. The same four destinations—Home, Community, Tools and Private chats—appear in the header on desktop/tablet and in a fixed bottom bar on phones. New visitors start at Home; members with completed profiles start at Community unless they opened a specific link. Login, email verification and profile completion preserve the chosen question or participation intent.

Guides sit alongside the toolbox, campus situations, member experiences, private My space and the member campus comfort guide on the Tools page. `#home`, `#community`, `#ask`, `#respond`, `#guide`, `#resources=toolbox`, `#resources=situations`, `#resources=takeaways`, `#resources=workspace`, `#resources=spaces`, `#conversations`, `#question=<id>` and `#question=<id>&answer=<id>` support refresh and browser history. Previous `#resources` links still open the guide. This navigation does not change server access rules: the homepage contains no member posts, community data requires verified, complete profiles, and private chats remain participant-only.

中英文首页提供“提出问题、回应问题、看看指南与工具”三个入口。电脑和平板使用顶部导航，手机使用固定底部导航，均包含“首页、社区、工具、私聊”。新访客默认进入首页，已完成资料的成员默认进入社区；指定链接优先。登录、邮箱验证和填写资料后，会继续进入原先选择的入口。公开首页不展示成员内容，社区与私聊沿用原有访问权限。

## Join the community

1. Choose **English** or **中文** in the header.
2. Select **Sign in with email → Create account**, verify your email, then click **Check verification & continue**. Returning members use their email and password; an already-verified address does not need another verification email. Password recovery is available in the same dialog.
3. Choose a display name, your group (neurodivergent or neurotypical), student/staff role, and an optional university. You can also choose communication preferences; displaying those tags to other members is optional and off by default.
4. Read and agree to the community guidelines.
5. Both groups can post questions. Open **Answers & open conversation** on a question to publish an answer in your own column, or join an existing column's follow-ups. Public community discussion starts immediately; the question's author does not need to accept an invitation.
6. Optionally invite the question's author to a private chat. Only this private route needs acceptance. You can share a guide in private chat, end a connection, or block/report a member or contribution.

The shared guide is available before sign-in. Interface language changes do not translate or alter members' own posts and messages. Guide references are displayed in the selected language.

## 加入社区

1. 在页首选择 **English** 或 **中文**。
2. 点击 **邮箱登录 → 注册账号**，完成邮件验证后点击 **检查验证结果并继续**。已有账号可用邮箱与密码登录；已验证的邮箱无需反复接收验证邮件。也可以在同一窗口重置密码。
3. 填写昵称，选择神经多样性或神经典型群组、学生或教职员工身份；大学名称可选填。也可以选择沟通偏好，默认不向其他成员展示，是否显示标签由你决定。
4. 阅读并同意社区规则。
5. 两个群组都可以发布问题。点击问题上的 **回答与公开交流**，在自己的回复栏发表回答，或直接加入已有栏目的后续交流。社区公开讨论无需等待提问者接受邀请。
6. 也可以选择邀请提问者私聊；只有这条私人聊天路径需要对方接受。你可以在私聊中分享指南、结束连接，或屏蔽、举报成员与内容。

共享指南无需登录即可阅读。切换界面语言不会改写成员发布的问题与消息，引用的指南会随界面语言切换。

### Email verification on mainland China networks · 国内网络邮箱验证

If an email link will not open, choose **Email link won’t open? Verify on DrFrog** in the verification panel and paste the full link from your own email. This completes verification on this site without opening the Firebase page. The site also checks verification when you return to the browser tab and refreshes sign-in after confirmation. An accepted delivery request does not guarantee inbox arrival: check the address, spam folder and sender-block settings, wait a few minutes, and then resend if needed. The resend button has a 60-second cooldown; server/provider limits still apply. Use a mailbox you can access normally on your network. QQ registration has a successful member report, which does not guarantee delivery to every mailbox. Registering with a different address creates a separate account and does not move an existing profile or messages.

验证邮件中的网页打不开时，在验证面板点击 **邮件链接打不开？在本站验证**，粘贴自己邮件中的完整链接，即可通过本站验证，无需打开 Firebase 页面。返回本站标签页时也会检查验证结果，并在确认后刷新登录状态。发送请求成功不代表邮件已进入收件箱：请核对邮箱地址、检查垃圾邮件和拦截设置，等待几分钟后再重发。重发按钮有 60 秒冷却时间，服务器与邮件服务商仍有频率和额度限制。请使用当前网络能正常打开并收信的邮箱；已有成员反馈 QQ 注册成功，但这不保证每个邮箱都能收到邮件。换用其他邮箱注册会建立另一个账号，不会迁移原账号的资料或消息。

## Question discussions · 回答与公开交流

The primary question interaction is a member-visible discussion board. Each responding member can publish one root answer at a time per question, creating a separate column. The question's author joins through follow-ups rather than creating a root answer to their own question. Any permitted community member—including the question's author, the answer's author and other members—can reply directly in any accessible column. No private offer or author-acceptance step is involved.

“Public” here means visible to signed-in members with verified accounts and completed profiles. Guests can explore the guide, toolbox and campus situations, but cannot read or publish community questions, answers or follow-ups. Publication controls state this visibility before submission. Display names, roles, optional universities and explicitly shared preferences appear with answers and replies. Blocks filter accessible questions, columns, comments and counts.

Authors can delete their own content. Deleting an answer column also deletes its follow-ups. A resolved question accepts no new root answers or private invitations, while existing answer columns and private conversations can continue. Members can report answers or comments; the moderator can remove a reported column or individual comment. Reports retain the question/answer context and, where relevant, the comment snapshot after content is removed.

Existing private offers and chat messages remain separate and are never republished into these columns. Optional private invitations still require the question author's acceptance, and their text remains visible only to sender and recipient; private messages remain participant-only, with operator access as described below.

## Pointer and tablet experience

The same live app adapts to desktop, iPad/tablet and phone widths. From **1200px**, the community has an ask panel on the left, a wider question feed in the middle and a help panel on the right, aligned at the top. At **1025–1199px**, questions have a wide main column with the two secondary cards stacked beside them; at **761–1024px**, questions span the width above those two cards. The ask shortcut sits in the community intro outside the panel grid. A distinct feed heading and aligned topic/status controls improve scanning. Header rows, chat lists, resource panels, fitting dialogs and controls of at least 44px accommodate touch use. Discussion columns adapt to one column below 850px, two across the remaining tablet widths, and one in comfort focus mode. This is a responsive layout, not a separate tablet app. Local checks used fictional content at desktop/laptop, tablet and phone widths, including Chinese, larger text and single-panel reading mode.

A static 32px frog cursor appears on browsers with a fine pointer and hover support, with a native fallback. Touch/coarse pointers keep native behavior; text entry/selection and disabled controls retain their appropriate cursors. The cursor uses the project's sage/ink palette alongside the existing cream/slate/clay design.

## Practical community features · 社区小帮手

1. **Communication preferences · 我的沟通偏好:** choose short replies, direct explanations, slower replies, and a preferred conversation language in **My profile**. Preferences are saved with the account but hidden from other members by default. Select **Show these tags to other members** and save to display them alongside questions, public answers/follow-ups, private invitations, member cards and conversations. Hiding them again removes preference values from peer API responses; operators can still access the stored records.
2. **Campus toolbox · 校园工具箱:** open **Tools & ideas → Campus toolbox** for six editable bilingual message templates covering assignment instructions, feedback, deadlines, group-work roles, staff feedback preferences and university support. Copy a message and send it yourself. Unsaved edits stay in the current open page, separately per template/language. Members can choose **Save draft** to keep a private account copy and restore it after a reload or on another device. Unsaved edits clear when accounts change; saved copies remain with their owner. Each template draft is bounded to 3,000 characters. Nothing is sent by the toolbox.
3. **What helped · 有帮助的办法:** signed-in members with completed profiles can explicitly publish a separately written experience, filter contributions by topic, delete their own contribution or report another. The member feed omits the author's name and account ID; the operator can identify the stored contribution's author for moderation. Members should omit names, contact details and identifying stories. Private chats are never automatically copied into this section. A report keeps a body/topic snapshot, which can remain after the contribution is deleted.
4. **Support choices · 你希望得到怎样的支持？:** a question can optionally ask for listening, practical suggestions, another perspective or shared experiences. The selected choice appears on the question to help responders understand the request.
5. **Campus situations · 校园情境:** five bilingual examples in **Tools & ideas → Campus situations** invite members to explore possible perspectives and clarification questions. They do not diagnose people or claim to reveal someone else's thoughts.
6. **Reading settings · 舒适阅读:** choose larger text, a plain font, one community section at a time, and automatic updates every 30, 60 or 120 seconds—or manual updates. These settings stay in that browser rather than the account. With manual updates, use the question, public discussion or private message **Refresh** button; the experiences feed also has its own refresh button.
7. **Questions waiting for a response · 等待回应的问题:** combine topic and status filters to find open questions without a visible public answer or an active, unblocked private invitation, questions still open, or resolved questions. Authors can mark a question resolved or reopen it. Resolution stops new answer columns and private invitations while existing follow-ups and private conversations can continue.

The toolbox and campus situations can be explored before sign-in. Community questions, preferences shown with member records, and shared experiences require a signed-in member with a completed profile. These features use the existing hosting and database; no paid model or external AI service is connected.

## Save, plan and find campus spaces · 稍后继续与校园空间

**Tools → My space** contains account-private saved drafts, community bookmarks and small-step plans. Members explicitly save incomplete question drafts and edited message templates; saving does not publish them. Each language/template has its own saved draft. **Continue editing** restores the appropriate editor and asks before replacing different unsaved text. Publishing a matching question removes its saved draft only if that saved revision is still current; a newer draft on another device is retained. Saved questions/answers reference live member content rather than copying it. Deleted or blocked content becomes an unavailable, removable placeholder without its body, author or target identifiers. Saved answers reopen their own answer column, including older answers outside the first page.

The planner stores an editable goal and up to 20 small steps of 200 characters each, shows the next incomplete step, and supports completion, undo and editing. It has no streaks, scores or automatic AI splitting. A member can choose an optional local calendar time/alert offset, download a UTF-8 .ics file and import it into their own calendar. Calendar alerts depend on that calendar; DrFrog sends no planner reminder emails or browser notifications. Plans remain private through the member API, with operator access to stored records. Saved drafts/plans use revision checks to reject stale overwrites. Account changes clear visible caches and unsaved editors.

**Tools → Campus comfort** is a signed-in member guide of dated personal observations, with university, location, noise, lighting, crowding, seating, break-space suitability and observation time. Members filter by university/noise/lighting/crowding, publish with explicit member-visibility consent, remove their own entry or report another. Conditions and access can change; members should check current university information. Descriptions are not accessibility certifications or live location tracking. The list has stable pagination and honors mutual blocks. On smaller screens, browsing comes before the contribution form; My space offers shortcuts to saved items and the planner. The production guide starts with real contributions, without invented campus listings.

Limits per member are 21 saved draft keys, 100 bookmarks and 30 plans. Private writes are capped at 60/minute. Campus publishing has a durable 5/minute allowance that deletion does not refund. These text features use the existing D1 database and self-hosted frontend; no paid model, map API or new account is required.

The other proposed features—official university support directories, text-based study sessions and shared group-work agreements—are not implemented in this release. Their basic text versions can use this architecture within its quotas. A support directory needs curated official sources and dates; study sessions need opt-in participant/goal/timer state; group work needs invitation-based membership, roles and shared revision control. Built-in audio/video would be a separate infrastructure decision.

## Accounts, storage and privacy

DrFrog production authentication uses Firebase email/password. The Worker validates signed Firebase ID tokens, their project/issuer/expiry, and verified email. Passwords are managed by Firebase and are never stored in the community database. The Cloudflare build ignores OpenAI identity headers. The separate legacy Sites build retains compatibility with Sites' trusted platform sign-in until explicitly reconfigured; do not host that legacy mode behind an untrusted proxy.

Profiles, communication preferences, questions and their support/status settings, public answers/follow-ups, private offers, conversations, messages, blocks, shared experiences, saved drafts/bookmarks/plans, campus observations and reports are stored in Cloudflare D1. They survive browser reloads and are shared between the authorized accounts according to their visibility rules. Reading settings stay in the browser. Unsaved toolbox edits stay in the open page; explicitly saved drafts belong to the member account. The old local prototype's browser data is not uploaded into the live community.

- Only signed-in members with a completed profile can read questions and helper profiles.
- Public answers and follow-ups are visible to permitted signed-in, verified members with completed profiles; private invitation acceptance is not required for this route.
- Private offers are readable only by their sender and the question's author. They are not converted into public answers.
- Private messages are readable only by the conversation's participants, with a separate operator-only path for reported conversations. Existing messages are not copied into public discussion.
- The site operator can access stored database records. Messages are not end-to-end encrypted.
- Blocking works in both directions; ending a connection stops new messages for both people.
- University membership, staff status and group choices are self-reported. No diagnosis, student ID or email is saved in community profiles.
- The first release retains records until the operator removes them. Automated account deletion and retention schedules are not implemented.
- Reports are stored for manual review; the service does not promise immediate responses.
- Hidden communication preferences are not included in information returned to other members. Choosing to display them shares them with authorized community members, not anonymous visitors.
- Shared experiences hide the author's identity in the member feed but retain an author account reference in the database. Report snapshots can outlive a deleted experience; this is not anonymous storage from the operator.
- Campus reports retain bounded place, university and description snapshots, which survive deletion for moderator review.
- Public-answer reports retain bounded snapshots of the question and answer and, for a reported follow-up, that comment. Removing content from the member view does not remove these moderation snapshots.

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

The private/campus tools add `drizzle/0004_wellbeing_tools.sql` and matching Drizzle metadata. Runtime helpers initialize only fixed additive tables/indexes on relevant workspace/campus/report routes, preserving all previous community records. Existing databases can apply the same `IF NOT EXISTS` migration safely.

Public discussion adds `drizzle/0003_public_answers.sql` and its schema snapshot. `src/public-answers.mjs` similarly bootstraps the three fixed `question_answers`, `question_answer_replies` and `public_answer_report_links` tables plus five indexes through the D1 binding. The unique post/author index enforces one root answer per member per question, including concurrent submissions. Both bootstrap and migration are additive and use `IF NOT EXISTS`; neither imports private offers or chats into public discussion.

## Source layout

- `public/`: bilingual UI, guide, responsive styles, supplied frog portrait and self-hosted fonts.
- `public/workspace.js`, `public/workspace-calendar.js` and `public/campus-spaces.js`: private save/plan tools, calendar exports and member campus observations.
- `public/features.js` and `public/campus-content.js`: communication tags, practical resource UI, editable bilingual templates, campus scenarios and browser-local reading settings.
- `public/discussion.js` and `public/discussion.css`: member-visible parallel answers and direct follow-ups.
- `public/tablet.css` and `public/assets/frog-cursor.svg`: dedicated tablet breakpoints, touch controls and the fine-pointer frog cursor.
- `src/api.mjs`: server authorization, profiles, posts, offers, messages, blocks and reports.
- `src/community-features.mjs`: preference validation/visibility and fixed additive D1 schema bootstrap for community features.
- `src/public-answers.mjs`: fixed additive schema bootstrap for public answer lanes, follow-ups and moderation snapshots.
- `db/schema.ts` and `drizzle/`: database schema and generated migrations.
- `scripts/build.mjs`: Worker build; `scripts/preview.mjs`: local-only server.
- `tests/community.test.mjs`: multi-account access, consent, communication, block/report and pagination tests.
- `tests/community-features.test.mjs`: preference visibility, question support/status, waiting filters, anonymous experience feeds, report snapshots and preservation of existing data during schema bootstrap.
- `tests/public-answers.test.mjs`: member-visible discussions, direct multi-member follow-ups, privacy boundaries, deletion/moderation, pagination, concurrent roots and additive data preservation.
- `.openai/hosting.json`: the existing Site identity and logical database binding.

The requested palette is cream **#E9E0D0**, slate **#6F8097**, and terracotta **#C88972**. The supplied frog is framed as a circular logo without redrawing it. Fredoka, Comic Neue and ZCOOL KuaiLe are self-hosted with their included SIL Open Font License files.

## Validation

The automated suite covers authentication, community features, public discussions, navigation and the new private/campus tools. Navigation tests cover visitor/member defaults, participation and question-link round trips, public tool routes and invalid-link rejection. Discussion tests use fictional local members and cover independent answer columns, direct multi-member follow-ups, author participation, one-root enforcement, verified/profile access boundaries, blocking, support/resolution, retained report snapshots, moderator removals, equal-timestamp pagination, rate limits and preservation of private chat data during schema bootstrap/migration.

Automated tests cover anonymous access, incomplete onboarding, mutual participation, cross-origin writes, private offers, author-only acceptance, idempotent acceptance, participant-only messages, Chinese text, guide references, ending connections, bidirectional blocking, operator-only report review, rate limits and pagination across equal timestamps. Account tests cover secure cookies, fixed provider endpoints, session refresh, verification, recovery and abuse limits, including bounded verification-confirmation refresh, account-identity checks and email-specific quota errors. A read-only `/api/me` verification failure can trigger one session recheck and one retry; writes are never automatically replayed.

Community-feature tests cover hidden and displayed preferences across peer surfaces, bounded support choices, author-only resolution/reopening, waiting filters before pagination, anonymous member-facing experience responses, explicit publication consent, deletion/report review and retained report snapshots. They also exercise the runtime bootstrap against a database containing the original schema and records.

Earlier local browser checks covered both-language onboarding, language switching with a question draft, private offers and acceptance, private messages, guide sharing, language persistence and responsive layouts. Homepage checks used disposable local members and mocked email services: public tools, keyboard tabs, saved routes, ask/respond shortcuts, question refresh, sign-out cleanup, login → verification → profile → original question, browser back/forward, and phone/tablet layouts including larger text and plain fonts. Earlier production checks covered email signup, verification, profile completion and moderator access with the owner's account. New discussion behavior is validated with fictional local members; these earlier production checks do not certify the new discussion flow with real production members.


### Likes and optional reply email

Questions and root answers have idempotent per-member likes. Counts exclude mutually blocked members; liker rosters are not exposed, and likes do not reorder the feed. The additive migration `0005_reactions.sql` matches the runtime bootstrap.

Reply email is off by default for every member and for an unconfigured site. **My profile → Reply email reminders** lets a member explicitly opt in. Only the authenticated, verified account email is saved; an opt-out clears that address. Brevo receives the address and a generic bilingual link, without question, answer, profile or private message text. Notifications are only for the question owner on another member's public answer/follow-up, with self/blocked/deleted events suppressed. Likes and private messages do not send emails.

The persistent outbox caps delivery attempts at 200/day by default (never above 200), leaving room within Brevo's 300/day free allowance; other Brevo uses share its allowance. Per-owner/question cooldown limits mail to once per hour. Concurrent claims are guarded. Only explicit HTTP 429 rejection retries, up to three provider attempts; transport ambiguity is terminal to avoid duplicate sends. A provider request already handed off cannot be recalled by opt-out. Pending events are retried on later authenticated activity, with no paid cron or queue; reminders can be delayed and delivery is not guaranteed. Terminal event metadata is pruned after 30 days and unsubscribe tokens after 90 days on delivery activity.

Unsubscribe links contain random capability tokens, hashed in the database. GET shows confirmation, POST opts out. No sign-in is required, and email-link scanners cannot opt someone out simply by opening a link. The `0006_reply_notifications.sql` migration is additive; no mail content or provider key is returned by the API.

Latest local browser verification used disposable fictional members and mocked Firebase: persisted private question/template drafts, saved question/answer deep links, planner progress across reload/language changes, campus observation publication and filters, question/answer like state, and unconfigured email preferences. Layouts were inspected at phone (390px), tablet (820px) and desktop (1440px) widths. Calendar generation is covered by four unit tests; the in-app browser download-event capture timed out, so import into a real calendar remains a user check. Reply delivery tests mock Brevo; real inbox delivery remains a separate consenting-member check.
