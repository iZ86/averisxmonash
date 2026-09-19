import { google } from "googleapis";
import { env } from "@/config/env";

export function createOAuthClient() {
  return new google.auth.OAuth2(
    env.googleClientId,
    env.googleClientSecret,
    env.googleRedirectUri,
  );
}
