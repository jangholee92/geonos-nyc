# GEONOS — judge guide

GEONOS helps you compare two NYC buildings for a climate-sensitive use and identify the next owner document or site inspection that could change your decision.

## Watch the recorded demo

Watch the [public recorded demo](https://jangholee.com/geonos-nyc/) — access and overview playback verified on 31 October 2026. It includes the 2:52 overview and 8:17 full walkthrough, captions and transcripts. The same page is available locally at [docs/index.html](docs/index.html). Watch directly in your browser with captions and transcripts.

The recordings use edited actual product states and synthetic English narration. The Muse Image sequence presents an earlier illustrated inspection example for 572 Smith Street and 611 Court Street, dated 30 October 2026.

## Access and verified release

The [hosted application](https://geonos-nyc-explorer-jh-1027.jholee.chatgpt.site) **requires access**: its last verified audience was owner-private. Arrange application access with the owner, or use the independent local setup below.

The demonstrated v15 release was deployed on **31 October 2026 at 00:39 UTC**, from source `fd667567f782f37df64358d4c90554ee99a35c84`. Production browser checks covered editable synthetic-English transcription, paired SAM/Wonder analysis for 572 and 592 Smith Street, and local DINOv2 inference on the official 2020/2024 image pair. This repository adds the authentication hardening documented in [PUBLIC_EXPORT.md](PUBLIC_EXPORT.md).

For an independent local review, follow [Run locally in the README](README.md#run-locally). The map, public-data inspection, requirements and exports run independently of the Meta API; live source lookups use network access. Optional model requests require **your own approved Meta account and server-side key**. Keep the preview on loopback; leave `TRUST_SITES_PROXY_IDENTITY=false`.

## A short walkthrough

1. **Find a real building.** In the top address box, enter BIN **3008210** and select/search it. This resolves 572 Smith Street, Brooklyn. Inspect its outline and measurements in the left panel. Building footprint and whole-tax-lot floor area are deliberately separate.
2. **Compare a second building.** Search BIN **3008212** for 592 Smith Street. The left panel becomes an A/B comparison. Open the context disclosures to inspect source dates, rainfall scenarios, reported energy and missing information. Click another mapped outline to explore beyond the search results.
3. **Test a condition.** Open **Check my requirements**. Add or change an explicit condition, then see which facts support it, conflict with it or remain unknown. Export the investigation and check that its source scope and unknowns remain visible. Use the remaining questions to request usable-space measurements and electrical-capacity records.
4. **Ask a decision question, if Meta is enabled.** In the right-hand chat, ask: “Compare the available evidence for these two buildings for a cold-storage project. Which inspection should I request first, and what finding could change the choice?” Read the answer and its Sources. The chat identifies model responses, provider status and application-written public-data briefs.

On a narrow screen, use the bottom **Map**, **Building/Compare** and **Meta** controls to move between panels.

## Optional model exercises

Use the **+** button beside the message box. Selecting an exercise fills an editable draft. Review it, then send when ready.

- **Compare roofs & tree context:** send the draft with both buildings selected. Inspect the two actual dated aerials, SAM roof/tree detections and Wonder's review of their typed summaries. The next checks should connect the images to a current site visit.
- **Explore a place through time:** retrieve the official 2020/2024 pair, then press **Run DINOv2 visual comparison**. Inference runs locally; first use downloads approximately **33.1 MB** of model/runtime assets. Move the divider and inspect the original photographs. Local inference runs independently of API credentials; enable Meta access for the current chat path that retrieves the image pair.
- **Challenge the comparison** or **Illustrate the inspection plan:** request a second review or a labelled generated concept. Use the labelled concept to communicate the written inspection checks.
- **Voice note:** record or upload up to 60 seconds, transcribe, edit and choose **Add to message**. Sending remains a separate action. The recorded exercise demonstrates synthetic-English transcription, editing and the separate send action.

## Follow the evidence to the next action

Look for a conditional tradeoff and a decision-changing next check. Read stormwater evidence at the modeled-ground scale, climate projections at the regional scale and heat vulnerability at the community scale. Follow each energy report’s property boundary. Inspect the original photographs alongside SAM masks and DINOv2 comparison windows, then use Wonder’s review of structured summaries to prioritize the site visit.

Explore the [verification record](README.md#verification), [data methods](public/reports/LAYERS_METHODS.md) and [hackathon build scope](HACKATHON_BUILD_SCOPE.md) for tested examples, source handling and the project’s original contributions.
