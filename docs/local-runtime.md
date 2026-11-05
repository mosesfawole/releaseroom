# Recorded local runtime setup

The demonstration uses the official Switch 0.31.0 Docker Compose stack inside Ubuntu WSL, with the official agent controller bundled in Switch Console 0.40.1. Console's WSLg window opened, but the desktop capture helper returned an unrelated window image; administration therefore uses the official Gateway and controller CLI. No replacement agent transport or mock server is used in the live setup.

## Components and addresses

| Component | Local address or location |
| --- | --- |
| Switch API | `http://127.0.0.1:18880` |
| Switch Gateway | `http://127.0.0.1:18881` |
| Mattermost | `http://127.0.0.1:18865` |
| PostgreSQL host port | `15432` |
| Compose project | `releaseroom` |
| Stack configuration | `/var/tmp/releaseroom-work/stack` inside Ubuntu WSL |
| Disposable seeded demo | `/var/tmp/releaseroom-work/demo` inside Ubuntu WSL |

The API, Gateway, and Mattermost use loopback bindings. ClearCart's port 3000 is separate. Database and chat history are in this Compose project's volumes; do not use `down --volumes` unless you intend to remove the demo data.

## Recreate the stack

Obtain the Compose file pinned in the [official Console 0.40.1 source](https://github.com/sandbox-quantum/switch/blob/switch-console-v0.40.1/console/apps/switch-console-desktop/src/main/core/managed-switch-server/resources/standalone-docker-compose.pinned.yml) and the corresponding [environment template](https://github.com/sandbox-quantum/switch/blob/switch-console-v0.40.1/.env.example). Store them privately as `compose.yml` and `.env` in a dedicated local directory.

Set `SWITCH_VERSION=0.31.0`; set the four host ports to those above; keep `SWITCH_BIND_ADDR=127.0.0.1`; set `FRONTEND_BASE_URL=http://127.0.0.1:18881`; and enable `FEATURE_FLAGS_ENABLED=agent_management`. Choose local demo account names. The recorded setup uses Mattermost's `reviewer` account and a local Gateway administrator.

Generate fresh random values for `DB_PASSWORD`, `DB_OWNER_PASSWORD`, `AGENT_REGISTRATION_TOKEN`, `GATEWAY_ADMIN_PASSWORD`, `MATTERMOST_ADMIN_PASSWORD`, `MATTERMOST_USER_PASSWORD`, and `CONTROLLER_TOKEN_SECRET`. Use `SECRET_KEYS=<local-label>:<32 random bytes as hex>`. Retain each value locally across restarts. The template's optional legacy `JWT_SECRET_KEY` can be blank on a new deployment. Keep optional `MESSAGING_PUBLIC_URL` and `GATEWAY_PUBLIC_URL` blank for this loopback-only setup: the messaging public URL is for public OAuth endpoints and rejects plain HTTP.

From the private stack directory:

```sh
docker compose -p releaseroom --profile collab --profile gateway pull
docker compose -p releaseroom --profile collab --profile gateway up -d
curl --fail http://127.0.0.1:18880/health
curl --fail http://127.0.0.1:18865/api/v4/system/ping
```

Wait for the official setup container to finish bootstrapping Mattermost and linking the reviewer account to the Gateway administrator. Use the generated local passwords to sign in. Do not publish `.env`, cookies, enrollment codes, or raw startup logs.

## Run the genuine builder

Install the official Linux Codex CLI and sign it in through a method authorized by the operator. The recorded demo uses Codex 0.166.0 and the user's explicitly authorized existing Codex sign-in, copied to a separate private local configuration directory. It does not change the user's primary configuration or use the rejected AgentRouter key.

Use the [official controller instructions](https://github.com/sandbox-quantum/switch/blob/switch-console-v0.40.1/console/packages/agent-controller/README.md). The installed Console supplies these bundles:

```text
/opt/Switch Console/resources/dist-sidecar/agent-controller.mjs
/opt/Switch Console/resources/dist-sidecar/shared-host.mjs
```

Create a one-time machine enrollment code in the Gateway. With the Linux Codex CLI on PATH and the authorized `CODEX_HOME` in the environment, enroll and run:

```sh
node '/opt/Switch Console/resources/dist-sidecar/agent-controller.mjs' enroll \
  --server http://127.0.0.1:18880 --code '<one-time code>' \
  --name 'ReleaseRoom WSL' --data-dir /private/controller --secret-store file

node '/opt/Switch Console/resources/dist-sidecar/agent-controller.mjs' run \
  --data-dir /private/controller \
  --shared-host-bundle '/opt/Switch Console/resources/dist-sidecar/shared-host.mjs'
```

In Gateway's agent management, create `release-builder` on this machine with provider `codex`, the chosen model, its working directory set to the native Linux demo clone, and the repository's builder instructions. Use normal automatic permission review; bypass approval is unnecessary for the demo.

Register an external agent named `release-gatekeeper`, keep its key local, and create a Mattermost public channel named `release-room` with both agents and the reviewer. Room creation requires `channel_type=channel_public` when using the documented Gateway API. Apply the room instructions and configure the gatekeeper's `.env` with the exact authenticated sender IDs from this deployment. Follow the main README to start the gatekeeper and run the report/verification/approval scenario.
