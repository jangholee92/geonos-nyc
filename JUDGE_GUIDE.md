# GEONOS — judge guide

GEONOS helps you compare what public evidence says about two NYC buildings and identify the next owner document or site inspection that could change your decision. It does not produce a resilience score, investment return or building approval.

## Access and verified release

The [hosted application](https://geonos-nyc-explorer-jh-1027.jholee.chatgpt.site) **requires access**: its last verified audience was owner-private. This link is not a promise of public judge access. Repository access does not grant application access.

The demonstrated v15 release was deployed on **31 October 2026 at 00:39 UTC**, from source `fd667567f782f37df64358d4c90554ee99a35c84`. Production browser checks covered editable synthetic-English transcription, paired SAM/Wonder analysis for 572 and 592 Smith Street, and local DINOv2 inference on the official 2020/2024 image pair. These are specific verified examples, not guarantees for every request. This repository adds the authentication hardening documented in [PUBLIC_EXPORT.md](PUBLIC_EXPORT.md).

For an independent local review, follow [Run locally in the README](README.md#run-locally). The map, public-data inspection, requirements and exports work without a Meta key, subject to source availability. Optional model requests require **your own approved Meta account and server-side key**. Keep the preview on loopback; leave `TRUST_SITES_PROXY_IDENTITY=false`. No credential or production login is included.

## A short walkthrough

1. **Find a real building.** In the top address box, enter BIN **3008210** and select/search it. This resolves 572 Smith Street, Brooklyn. Inspect its outline and measurements in the left panel. Building footprint and whole-tax-lot floor area are deliberately separate.
2. **Compare a second building.** Search BIN **3008212** for 592 Smith Street. The left panel becomes an A/B comparison. Open the context disclosures to inspect source dates, rainfall scenarios, reported energy and missing information. Click another mapped outline to explore beyond the search results.
3. **Test a condition.** Open **Check my requirements**. Add or change an explicit condition, then see which facts support it, conflict with it or remain unknown. Export the investigation and check that its source scope and unknowns remain visible. Public records do not establish usable space or available electrical capacity.
4. **Ask a decision question, if Meta is enabled.** In the right-hand chat, ask: “Compare the available evidence for these two buildings for a cold-storage project. Which inspection should I request first, and what finding could change the choice?” Read the answer and its Sources. A provider refusal is shown explicitly; a supported two-building request may separately receive a labelled source-based brief.

On a narrow screen, use the bottom **Map**, **Building/Compare** and **Meta** controls to move between panels.

## Optional model exercises

Use the **+** button beside the message box. Selecting an exercise fills an editable draft; it does not send it.

- **Compare roofs & tree context:** send the draft with both buildings selected. Inspect the two actual dated aerials, SAM roof/tree detections and Wonder's review of their typed summaries. The next checks should connect the images to a current site visit.
- **Explore a place through time:** retrieve the official 2020/2024 pair, then press **Run DINOv2 visual comparison**. Inference runs locally; first use downloads approximately **33.1 MB** of model/runtime assets. Move the divider and inspect the original photographs. Local inference needs no Meta key, but the current chat path that retrieves the pair requires enabled Meta access.
- **Challenge the comparison** or **Illustrate the inspection plan:** request a second review or a labelled generated concept. The concept is not an aerial photograph or validated engineering design.
- **Voice note:** record or upload up to 60 seconds, transcribe, edit and choose **Add to message**. Sending remains a separate action. Recorded verification used synthetic English; microphone capture and Korean recognition were not verified.

## What to look for—and what remains limited

The useful result is a conditional tradeoff and a decision-changing next check. A flood-map no-hit is not safety; regional climate projections are not building forecasts; community heat vulnerability is not building temperature. Energy reports can cover a whole reporting property, not the selected outline. SAM masks and DINOv2 differences do not establish roof condition, physical change, cooling benefit or structural capacity. Wonder receives summaries, not aerial pixels.

Some benign follow-ups still trigger Meta's content filter. The application preserves refusals and does not switch models to retry a denied task. Public sources can be unavailable or throttled. DINOv2 mobile performance was not verified. See [README limits](README.md#verification-and-known-limits), [data methods](public/reports/LAYERS_METHODS.md) and [hackathon build scope](HACKATHON_BUILD_SCOPE.md) for the evidence and pre-existing foundations.
