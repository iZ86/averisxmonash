import { google } from "googleapis";
import { env } from "@/config/env";

export function createOAuthClient() {
  return new google.auth.OAuth2(
    env.googleClientId,
    env.googleClientSecret,
    env.googleRedirectUri,
  );
}

// Sign-in only (identity), no Gmail access.
export function getLoginUrl(state: string) {
  return createOAuthClient().generateAuthUrl({
    scope: ["openid", "email", "profile"],
    state,
    prompt: "select_account",
  });
}
