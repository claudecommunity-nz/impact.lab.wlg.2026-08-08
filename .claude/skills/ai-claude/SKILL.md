---
name: ai-claude
description: Use Claude from Python loaders via wcc_impact.ask_claude and analyze_image — classification into signal fields, dedupe, confidence scoring, photo triage. Loader-side only, on your team's spend-capped key.
---

# AI with Claude (loader-side only)

`wcc_impact` wraps the Anthropic SDK with your team's key (`ANTHROPIC_API_KEY` in
`.env`, from the check-in card). Claude covers text AND vision — there is no second AI
vendor. **Never call AI from UI code** — browser code has no key, by design. AI belongs in
the loader, and its output goes into signal fields.

## ask_claude — one-shot text

```python
from wcc_impact import ask_claude

label = ask_claude(
    f"Classify this report into exactly one of: flooding, outage, road-closure, "
    f"coastal-hazard, other. Reply with the label only.\n\n{headline}"
)
signal_type = label.strip() if label.strip() in KNOWN_TYPES else "other"
```

Optional kwargs: `system=`, `max_tokens=` (default 1024), `model=` (default
`claude-haiku-4-5-20251001` — keep the default unless you have a reason).

## analyze_image — vision

```python
from wcc_impact import analyze_image

desc = analyze_image(
    photo_url,                       # https URL, local path, or raw bytes
    "Describe any storm damage visible. Reply 'none' if there is none.",
)
if desc.strip().lower() != "none":
    publish_signal(module_id=MODULE_ID, title="Photo report: storm damage",
                   signal_type="damage-report", source_type="community",
                   description=desc[:2000], media_urls=[photo_url])
```

## Patterns that work in signal pipelines

- **Constrain the output.** "Reply with the label only", "Reply with valid JSON matching
  {...}", enum lists in the prompt. Then validate — never trust free text into an enum
  field:

  ```python
  import json
  out = ask_claude(f'Extract as JSON: {{"place": str|null, "severity": '
                   f'"minor"|"moderate"|"severe"|"extreme"|"unknown"}}\n\n{text}')
  data = json.loads(out)              # wrap in try/except; fall back to defaults
  ```

- **Severity + confidence together.** Ask for a 0–1 confidence and put it in the
  signal's `confidence` field — the triage teams downstream use it.
- **Dedupe/corroboration.** Give Claude the new report plus recent titles and ask "is this
  the same incident as any of these? Reply with the matching title or NEW".
- **Geocoding assist.** Extract a `place_name` with Claude, then resolve coordinates with
  `geocode()` (see the geocoding skill) — don't ask Claude for lat/lng.

## Budget rules

Your key is **spend-capped per team** and revoked tonight. Practical implications:

- Call Claude on **new** items only (dedupe first — never inside a hot loop over
  unchanged data).
- Keep `max_tokens` small for classification (labels need ~10 tokens, not 1024).
- Batch where natural: classify 20 headlines in one prompt with numbered answers.
- If the key dies mid-demo, an organiser holds a spare — ask, don't share keys between
  teams (per-team caps exist so one team can't drain the room).
