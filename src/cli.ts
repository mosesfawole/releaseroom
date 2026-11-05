import { mkdir, open, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { SwitchClient } from "./switch/client.js";
import { GatekeeperService, redactError } from "./gatekeeper/service.js";

const envSchema = z.object({
  SWITCH_BASE_URL: z.url(), SWITCH_AGENT_ID: z.string().min(1), SWITCH_AGENT_API_KEY: z.string().min(1),
  SWITCH_ROOM_ID: z.string().min(1), SWITCH_HUMAN_ID: z.string().min(1), SWITCH_BUILDER_ID: z.string().min(1),
});
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let lock: Awaited<ReturnType<typeof open>> | undefined;
let client: SwitchClient | undefined;
let service: GatekeeperService | undefined;
const lockPath = path.join(repositoryRoot, ".runtime/gatekeeper.lock");
try {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) throw new Error(`Missing or invalid configuration: ${parsed.error.issues.map(i => i.path.join(".")).join(", ")}`);
  const env = parsed.data;
  if (process.argv.slice(2).some(arg => arg !== "--recover-gap")) throw new Error("Usage: npm start [-- --recover-gap]");
  await mkdir(path.dirname(lockPath), { recursive: true });
  lock = await open(lockPath, "wx", 0o600);
  await lock.writeFile(String(process.pid));
  client = new SwitchClient({ baseUrl: env.SWITCH_BASE_URL, agentId: env.SWITCH_AGENT_ID, apiKey: env.SWITCH_AGENT_API_KEY, roomId: env.SWITCH_ROOM_ID, onEvent: event => service!.handleEvent(event).catch(error => { console.error(`Room event failed: ${redactError(error, [env.SWITCH_AGENT_API_KEY, env.SWITCH_HUMAN_ID, env.SWITCH_BUILDER_ID])}`); }) });
  service = await GatekeeperService.open({ repositoryRoot, humanId: env.SWITCH_HUMAN_ID, builderId: env.SWITCH_BUILDER_ID, roomId: env.SWITCH_ROOM_ID, secrets: [env.SWITCH_AGENT_API_KEY, env.SWITCH_HUMAN_ID, env.SWITCH_BUILDER_ID], recoverGap: process.argv.includes("--recover-gap"), postMessage: (room, content) => client!.postMessage(room, content) });
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    await client!.close();
    await service!.drain();
    await lock!.close();
    await unlink(lockPath);
  };
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => { void stop().catch(() => { process.exitCode = 1; }); });
  await client.connect();
  console.log("ReleaseRoom connected. Waiting for addressed commands in the configured Switch room.");
} catch (error) {
  console.error(redactError(error, [process.env.SWITCH_AGENT_API_KEY ?? ""]));
  await client?.close();
  if (lock) { await lock.close(); await unlink(lockPath); }
  process.exitCode = 1;
}
