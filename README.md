# Common Ground

An interactive university peer-support prototype for students and staff across universities. The left group is neurodivergent; the right group is neurotypical. Group membership is self-selected. Questions and a shared guide occupy the center.

## Try the prototype

Run `node preview.cjs` from this folder and open http://127.0.0.1:4173.

Post a question, add an example offer, and accept or decline it. Alternatively offer help on an example question and simulate the author's acceptance. Accepted offers open a local conversation; add a message or share a guide entry. End a connection or reset the demo from the interface.

This is a frontend prototype, not a live community. Example profiles are fictional. Browser storage holds posts, offers, and messages on one device and origin. Nothing is delivered to another person. There are no real accounts, server permissions, identity verification, moderation, or AI inference. The shared guide consists of original conversation prompts with links to university resources, not a clinical encyclopedia. Individual preferences and university processes differ.

## A free live pilot

GitHub can hold source code and revision history. Keep user records and secrets out of the repository. Host the static frontend on Cloudflare Pages using the free provided subdomain; no paid custom domain is needed. A Supabase Free project can provide authentication, a database, and realtime subscriptions within its quotas.

Checked 30 September 2026: Supabase Free lists 50,000 monthly active users, 500 MB database space, 5 GB egress, and 1 GB file storage. Projects pause after one week of inactivity. These quotas are separate limits; the user allowance does not mean unlimited messaging. Stay on free plans and restrict usage when quotas are reached rather than enabling paid overages. Availability and pricing can change, so a permanent unlimited-free guarantee is not possible.

- Hosting: https://www.cloudflare.com/products/pages/
- Database/authentication quotas: https://supabase.com/pricing
- Free quota restrictions: https://supabase.com/docs/guides/platform/billing-faq
- GitHub: https://docs.github.com/en/get-started/start-your-journey/what-is-github

Before real users join, replace the local demo with server-backed accounts and posts. Use database row-level access rules so only a conversation's participants can read its messages, require author acceptance before creating a conversation, and provide block/report tools and a moderator workflow. Choose what university verification means; a typed university name is not verification. Staff status must not be presented as professional authority without checking it. Specify data retention/deletion and publish a clear privacy notice. Avoid collecting diagnostic documents.

## Optional AI

WebLLM can run a language model in a compatible browser using WebGPU, avoiding a hosted inference bill. Users still need suitable hardware, storage, and a model download. Model licenses and hosting for model files need to be checked. Provide the searchable guide as a fallback for unsupported devices.

Use AI to explain referenced guide entries or suggest wording. Keep source links visible, distinguish suggestions from university policy, allow people to edit drafts, and never send generated messages automatically. A model is not the encyclopedia or a substitute for source review.

- https://webllm.mlc.ai/docs/

## Source layout

- `dist/index.html`: interface and metadata
- `dist/styles.css`: responsive layout and styles
- `dist/cartoon.css`: cream (#E9E0D0), blue-grey (#6F8097), and terracotta (#C88972) cartoon theme
- `dist/assets/`: supplied frog portrait and matching favicon; the source image is framed in a circular viewport without redrawing it
- `dist/fonts/`: self-hosted Fredoka and Comic Neue fonts, with their SIL Open Font License files
- `dist/app.js`: local prototype flows and optional browser tool registration
- `preview.cjs`: local static server, using Node built-ins only
- `.openai/hosting.json`: private Sites preview identity and static configuration

The static files can be hosted elsewhere without the Sites manifest. A private Site is registered for an owner-only hosted prototype. Consult the latest successful deployment result for the hosted URL. The local preview is http://127.0.0.1:4173.

## Validation

JavaScript syntax passed. In the browser, creating a local question updated the feed; invalid question input was rejected without adding a post. A demo help offer remained pending until acceptance, acceptance opened a conversation, a local message and guide reference appeared in the chat, and ending the connection disabled further message composition. Guide search returned a relevant entry and rejected invalid input. Desktop (1440 px) and mobile (390 px) checks showed no document-level horizontal overflow. Demo data was reset after testing.

For the cartoon restyle, the exact supplied frog portrait and both self-hosted font families loaded successfully. The cream background matches #E9E0D0, with #6F8097 and #C88972 accents. The restyled desktop and mobile layouts showed no document-level horizontal overflow. Existing local questions and conversations were preserved.
