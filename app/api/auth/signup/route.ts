// ponytail: sign-ups are closed while we finish the app — join /create-account's
// waitlist (POST /api/leads, source "waitlist") instead. Reopen this when ready.
export async function POST() {
  return Response.json(
    { error: { message: "Sign-ups are closed right now — join the waitlist and we'll email you." } },
    { status: 403 }
  );
}
