# Third-party materials and licensing boundaries

This repository is a source snapshot for review and reproduction. No new project-wide software license is granted by this export. Public availability does not place every file in the public domain. Original application code, third-party software, model weights, government datasets and generated outputs are distinct categories.

| Material | Terms / notice retained |
|---|---|
| Meta SAM parser `@meta-sam/parser@0.1.0` | Custom [SAM License](third-party/meta-sam-parser.LICENSE.txt), copied from the installed pinned package. Not MIT. The package remains an npm dependency; its code is not copied as node_modules. |
| Meta DINOv2 weights and converted ONNX | [Apache-2.0 license](public/models/dinov2/LICENSE.txt), [official repository](https://github.com/facebookresearch/dinov2), [conversion/provenance manifest](public/models/dinov2/manifest.json). Converted artifact uses fixed preprocessing and INT8 weights as documented; no training or aerial change-detector calibration is claimed. |
| ONNX Runtime Web and bundled runtime | [MIT license](public/models/dinov2/runtime/LICENSE.txt), [third-party notices](public/models/dinov2/runtime/ThirdPartyNotices.txt). Runtime and worker source are included for the optional local model. |
| Vendored Sites Vite plugin | [Upstream MIT notice](scripts/vite/sites-vite-plugin.LICENSE). The public export adds explicit local secret-file denial and production identity gating. |
| Vendored shadcn CSS | [MIT notice](vendor/shadcn-tailwind-4.13.0.LICENSE.md). |
| Other npm dependencies | Resolved versions and license identifiers are in package-lock.json; upstream packages ship their own license text. Some build/transitive dependencies use LGPL, MPL or CC-BY terms. This document does not relicense them. |

Government source products retain their publisher attribution, dates, native keys and stated limitations. Do not describe all source products as MIT licensed or universally public domain:

- NYC Open Data: [terms](https://data.cityofnewyork.us/stories/s/Terms-of-Use/k9k7-3cje), individual [catalog references](public/data/catalog.json), and the data/method reports.
- NYS aerial imagery: [official program](https://gis.ny.gov/orthoimagery), dated 2020/2024 source metadata. Source imagery is retrieved on demand, not represented as original GEONOS photography.
- NOAA NCEI: [Open Data Policy](https://www.ncei.noaa.gov/sites/default/files/2023-12/NCEI%20PD-10-2-02%20-%20Open%20Data%20Policy%20Signed.pdf). Federal products and non-Federal-origin archive material can have different rights; retained source metadata takes precedence.
- Census and NYS/MTA data: publisher links are retained in the source catalog. No affiliation or endorsement is implied.

The exported snapshot excludes locally captured provider responses, generated concept images, voice files, private UI screenshots and the full research archive. Any separately published demo/media must preserve source/model attribution and must not expose account credentials or private user information.
