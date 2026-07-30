# Service and module specifications

This directory is the navigable catalog for domain-boundary specifications. A filename ending in
`-service.md` is a documentation convention, **not** evidence of a separately deployable service.
The repository has exactly three backend deployables:

| Deployable                                                                | Responsibility                                                                                           | Specification in this catalog                                                      |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| [`core-api`](../../apps/core-api/src/app/app.module.ts)                   | One NestJS modular-monolith application. Its 21 imported modules are catalogued below.                   | The domain-module entries below.                                                   |
| [`signaling-gateway`](../../apps/signaling-gateway/src/app/app.module.ts) | Socket.IO fanout, JWT handshake, connection quota, and Redis transport; it has no domain business logic. | [Realtime gateway](./realtime-gateway.md)                                          |
| [`media-server`](../../apps/media-server/livekit.yaml)                    | LiveKit configuration/deployment only; it has no NestJS modules or business logic.                       | No standalone domain spec; see the Calling and Party Room specs for its consumers. |

Do not infer runtime topology from a spec name. In particular, the pages in this directory do not
create a fourth backend app, and the Economy ledger remains owned by the `core-api` Economy module.

## Evidence vocabulary

The pages describe intended/current repository boundaries; they are not an execution report.

- **Implemented source evidence** means the referenced source file exists in this repository.
- **Automated-test source** means a relevant test file exists; it does not say that the test was run
  in this change or that it passed.
- **Production verification** requires operational evidence outside this catalog. Neither a source
  file nor a green local test proves it.
- **Deferred work** is called out in the individual spec or in the canonical
  [feature registry](../feature-registry.json); do not turn it into an implementation claim.

For the canonical machine-readable status and its precise evidence, use
[the feature registry](../feature-registry.json) and run `pnpm docs:check`. The generated evidence
report is a view of that registry, as defined in
[Documentation automation](../18-documentation-automation.md).

## `core-api` module specifications

Each row below is an imported NestJS module in
[`AppModule`](../../apps/core-api/src/app/app.module.ts). The source and test links distinguish
repository evidence from production verification without duplicating mutable status prose here.

| NestJS module  | Boundary specification                                                                                        | Implemented source evidence                                                                     | Automated-test source                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `avatar`       | [Avatar](./avatar-service.md)                                                                                 | [`avatar.module.ts`](../../apps/core-api/src/modules/avatar/avatar.module.ts)                   | [`avatar.service.spec.ts`](../../apps/core-api/src/modules/avatar/avatar.service.spec.ts)                        |
| `calling`      | [Calling](./calling-service.md)                                                                               | [`calling.module.ts`](../../apps/core-api/src/modules/calling/calling.module.ts)                | [`calling.service.spec.ts`](../../apps/core-api/src/modules/calling/calling.service.spec.ts)                     |
| `discovery`    | [Discovery](./discovery-service.md)                                                                           | [`discovery.module.ts`](../../apps/core-api/src/modules/discovery/discovery.module.ts)          | [`discovery.service.spec.ts`](../../apps/core-api/src/modules/discovery/discovery.service.spec.ts)               |
| `economy`      | [Economy](./economy-service.md)                                                                               | [`economy.module.ts`](../../apps/core-api/src/modules/economy/economy.module.ts)                | [`reconciliation.service.spec.ts`](../../apps/core-api/src/modules/economy/jobs/reconciliation.service.spec.ts)  |
| `feed`         | [Feed](./feed-service.md)                                                                                     | [`feed.module.ts`](../../apps/core-api/src/modules/feed/feed.module.ts)                         | [`feed.integration.spec.ts`](../../apps/core-api/src/modules/feed/feed.integration.spec.ts)                      |
| `friend`       | [Friend](./friend-service.md); [Streak](./streak-service.md) is its internal sub-service, not another module. | [`friend.module.ts`](../../apps/core-api/src/modules/friend/friend.module.ts)                   | [`friend.service.spec.ts`](../../apps/core-api/src/modules/friend/friend.service.spec.ts)                        |
| `gift`         | [Gift](./gift-service.md)                                                                                     | [`gift.module.ts`](../../apps/core-api/src/modules/gift/gift.module.ts)                         | [`gift.integration.spec.ts`](../../apps/core-api/src/modules/gift/gift.integration.spec.ts)                      |
| `matching`     | [Matching](./matching-service.md)                                                                             | [`matching.module.ts`](../../apps/core-api/src/modules/matching/matching.module.ts)             | [`matcher-worker.service.spec.ts`](../../apps/core-api/src/modules/matching/jobs/matcher-worker.service.spec.ts) |
| `mini-game`    | [Mini game](./mini-game-service.md)                                                                           | [`mini-game.module.ts`](../../apps/core-api/src/modules/mini-game/mini-game.module.ts)          | [`mini-game.integration.spec.ts`](../../apps/core-api/src/modules/mini-game/mini-game.integration.spec.ts)       |
| `mood`         | [Mood](./mood-service.md)                                                                                     | [`mood.module.ts`](../../apps/core-api/src/modules/mood/mood.module.ts)                         | [`mood.integration.spec.ts`](../../apps/core-api/src/modules/mood/mood.integration.spec.ts)                      |
| `movie-match`  | [Movie Match](./movie-match-service.md)                                                                       | [`movie-match.module.ts`](../../apps/core-api/src/modules/movie-match/movie-match.module.ts)    | [`movie-match.integration.spec.ts`](../../apps/core-api/src/modules/movie-match/movie-match.integration.spec.ts) |
| `notification` | [Notification](./notification-service.md)                                                                     | [`notification.module.ts`](../../apps/core-api/src/modules/notification/notification.module.ts) | [`notification.service.spec.ts`](../../apps/core-api/src/modules/notification/notification.service.spec.ts)      |
| `palm-match`   | [Palm Match](./palm-match-service.md)                                                                         | [`palm-match.module.ts`](../../apps/core-api/src/modules/palm-match/palm-match.module.ts)       | [`palm-match.service.spec.ts`](../../apps/core-api/src/modules/palm-match/palm-match.service.spec.ts)            |
| `party-room`   | [Party Room](./party-room-service.md)                                                                         | [`party-room.module.ts`](../../apps/core-api/src/modules/party-room/party-room.module.ts)       | [`party-room.integration.spec.ts`](../../apps/core-api/src/modules/party-room/party-room.integration.spec.ts)    |
| `safety`       | [Safety](./safety-service.md)                                                                                 | [`safety.module.ts`](../../apps/core-api/src/modules/safety/safety.module.ts)                   | [`safety.service.spec.ts`](../../apps/core-api/src/modules/safety/safety.service.spec.ts)                        |
| `short-video`  | [Short video](./short-video-service.md)                                                                       | [`short-video.module.ts`](../../apps/core-api/src/modules/short-video/short-video.module.ts)    | [`short-video.service.spec.ts`](../../apps/core-api/src/modules/short-video/short-video.service.spec.ts)         |
| `soul-match`   | [Soul Match](./soul-match-service.md)                                                                         | [`soul-match.module.ts`](../../apps/core-api/src/modules/soul-match/soul-match.module.ts)       | [`soul-match.service.spec.ts`](../../apps/core-api/src/modules/soul-match/soul-match.service.spec.ts)            |

## `core-api` modules without a standalone domain spec

These modules are imported by `AppModule` and have source/test evidence, but no separate page in
this directory yet. Listing them prevents the catalog from implying that they are absent or are
deployables. Add a dedicated spec only when its domain boundary needs one; this table is not a
request to invent product behaviour.

| NestJS module | Current repository evidence                                                      | Automated-test source                                                                        | Current canonical detail                                                                                                                     |
| ------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `admin`       | [`admin.module.ts`](../../apps/core-api/src/modules/admin/admin.module.ts)       | [`admin.controller.spec.ts`](../../apps/core-api/src/modules/admin/admin.controller.spec.ts) | OpenAPI and the feature registry where applicable.                                                                                           |
| `auth`        | [`auth.module.ts`](../../apps/core-api/src/modules/auth/auth.module.ts)          | [`auth.service.spec.ts`](../../apps/core-api/src/modules/auth/auth.service.spec.ts)          | [Domain rules](../06-domain-rules.md), OpenAPI, and feature-registry record `auth-session`.                                                  |
| `support`     | [`support.module.ts`](../../apps/core-api/src/modules/support/support.module.ts) | [`support.service.spec.ts`](../../apps/core-api/src/modules/support/support.service.spec.ts) | OpenAPI and feature-registry record `support-tickets`.                                                                                       |
| `user`        | [`user.module.ts`](../../apps/core-api/src/modules/user/user.module.ts)          | [`user.service.spec.ts`](../../apps/core-api/src/modules/user/user.service.spec.ts)          | [Product features](../01-product-features.md), [domain rules](../06-domain-rules.md), and feature-registry record `user-profile-open-entry`. |

`review-module: N/A` — this catalog documents existing source/configuration evidence only; it does
not alter a business flow, deployable boundary, or Economy ledger behavior.
