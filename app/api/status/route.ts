import { handle, json } from "@/lib/server/http";
import { providerStatus } from "@/lib/server/status";

export const dynamic = "force-dynamic";

export const GET = handle(async () => json(await providerStatus()));
