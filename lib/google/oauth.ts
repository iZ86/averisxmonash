import { google } from "googleapis";
import { googleConfig } from "@/config/server-env";

export function createOAuthClient() {
  return new google.auth.OAuth2(
    googleConfig.clientId,
    googleConfig.clientSecret,
    googleConfig.redirectUri,
  );
}
