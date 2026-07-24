// Lightweight, local heuristic for "does this read like AI wrote it" — no
// model call, so it can update live as someone types. Flags common LLM
// filler phrases rather than trying to truly detect authorship.
const AI_PHRASES = [
  "in today's fast-paced world",
  "in today's digital age",
  "in the ever-evolving",
  "let's dive in",
  "dive into",
  "delve into",
  "unlock the power of",
  "unlock your",
  "game-changer",
  "game changer",
  "elevate your",
  "unleash the",
  "in conclusion",
  "it's important to note",
  "whether you're a",
  "look no further",
  "we're excited to",
  "embark on a journey",
  "seamlessly",
  "boost your",
  "transform your",
  "at the end of the day",
  "navigate the",
  "a testament to",
  "in a world where",
  "not only that, but",
  "top-notch",
  "cutting-edge",
  "revolutionize",
];

export type AiToneResult = { level: "natural" | "some" | "high"; matches: string[] };

export function checkAiTone(text: string): AiToneResult {
  const lower = text.toLowerCase();
  const matches = AI_PHRASES.filter((phrase) => lower.includes(phrase));
  const emDashCount = (text.match(/—/g) ?? []).length;
  const score = matches.length + (emDashCount >= 2 ? 1 : 0);
  const level = score >= 3 ? "high" : score >= 1 ? "some" : "natural";
  return { level, matches };
}
