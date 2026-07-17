import { requireUser } from "@/lib/auth";
import { PersonaStep } from "./persona-step";

export const metadata = { title: "Welcome" };

export default async function OnboardingStart() {
  const user = await requireUser();
  return <PersonaStep initial={user.persona} />;
}
