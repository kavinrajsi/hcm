"use server";

import { redirect } from "next/navigation";
import { currentUser } from "@/lib/rbac";
import { redirectUriMatches, resolveClient } from "@/lib/oauth/clients";
import { issueCode } from "@/lib/oauth/grants";

/** Allow or deny an AI app's request; redirects back to the app. */
export async function decide(formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const get = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value : "";
  };
  const client = await resolveClient(get("client_id"));
  const redirectUri = get("redirect_uri");
  // Re-checked here: the form's hidden fields are user-controlled.
  if (!client || !redirectUriMatches(client.redirectUris, redirectUri)) redirect("/oauth/authorize?error=invalid");
  const back = new URL(redirectUri);
  const state = get("state");
  if (state) back.searchParams.set("state", state);
  if (get("decision") !== "allow") {
    back.searchParams.set("error", "access_denied");
    redirect(back.toString());
  }
  const challenge = get("code_challenge");
  if (!/^[A-Za-z0-9\-_]{43}$/.test(challenge)) redirect("/oauth/authorize?error=invalid");
  const code = await issueCode({
    clientId: client.id,
    userId: user.id,
    redirectUri,
    codeChallenge: challenge,
    resource: get("resource") || null,
  });
  back.searchParams.set("code", code);
  back.searchParams.set("iss", get("issuer"));
  redirect(back.toString());
}
