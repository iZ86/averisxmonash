// Server-only environment variables. The "server-only" import makes the build
// fail if this file is ever imported from client code, so secrets never reach
// the browser bundle.

import "server-only";
import { required } from "@/lib/utils";

export const openRouterConfig = {
  apiKey: required("OPENROUTER_API_KEY", process.env.OPENROUTER_API_KEY),
  model: required("OPENROUTER_MODEL", process.env.OPENROUTER_MODEL),
};
