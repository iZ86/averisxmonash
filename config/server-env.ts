// Server-only environment variables. The "server-only" import makes the build
// fail if this file is ever imported from client code, so secrets never reach
// the browser bundle.

import "server-only";
import { required } from "@/lib/utils";


export const openRouterConfig = {
  get apiKey() { return required("OPENROUTER_API_KEY", process.env.OPENROUTER_API_KEY); },
  get model() { return required("OPENROUTER_MODEL", process.env.OPENROUTER_MODEL); },
};

export const googleConfig = {
  get clientId() { return required("GOOGLE_CLIENT_ID", process.env.GOOGLE_CLIENT_ID); },
  get clientSecret() { return required("GOOGLE_CLIENT_SECRET", process.env.GOOGLE_CLIENT_SECRET); },
  get redirectUri() { return required("GOOGLE_REDIRECT_URI", process.env.GOOGLE_REDIRECT_URI); },
  refreshToken: process.env.GOOGLE_REFRESH_TOKEN, // optional, stays eager
};
