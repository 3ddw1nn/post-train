// Runnable check for the one piece of non-trivial pure logic behind Thumbnail
// Maker: the prompt assembled for the AI "generate background" tab. If the
// text-suppression clause ever drops out, the model starts baking garbled
// text into every thumbnail with nothing catching it before it ships.
//
//   node --test lib/thumbnail-prompt.test.mjs
//
// Imported directly (not reimplemented) — Node 24 strips TS types natively
// for plain, erasable syntax like this module uses, so no build step needed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildThumbnailPrompt, THUMBNAIL_ANGLES, THUMBNAIL_PRESETS } from "./thumbnail-presets.ts";

test("always suppresses AI-generated text", () => {
  const prompt = buildThumbnailPrompt({ subject: "a chef mid-flambé" });
  assert.match(prompt, /no text, no words, no letters/i);
});

test("requires a subject", () => {
  assert.throws(() => buildThumbnailPrompt({ subject: "   " }));
});

test("each emotional angle produces a distinct prompt for the same subject", () => {
  const prompts = THUMBNAIL_ANGLES.map((a) => buildThumbnailPrompt({ subject: "a rocket launch", angle: a.id }));
  assert.equal(new Set(prompts).size, prompts.length, "angles must not collapse to the same prompt");
});

test("the aspect hint matches the chosen preset", () => {
  for (const preset of THUMBNAIL_PRESETS) {
    const prompt = buildThumbnailPrompt({ subject: "a mountain sunrise", presetId: preset.id });
    assert.ok(prompt.includes(preset.aspect), `expected ${preset.aspect} in prompt for preset ${preset.id}`);
  }
});

test("a reference image adds a likeness instruction", () => {
  const withRef = buildThumbnailPrompt({ subject: "a podcaster laughing", hasReference: true });
  const withoutRef = buildThumbnailPrompt({ subject: "a podcaster laughing", hasReference: false });
  assert.match(withRef, /reference image/i);
  assert.doesNotMatch(withoutRef, /reference image/i);
});
