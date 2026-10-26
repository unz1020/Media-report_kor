# Public media identification icons

These small, unmodified icons identify apps and buying platforms in the placement explorer. They are not client creatives, placement evidence, application screenshots or an endorsement by their owners.

- Seven application icons were read from the respective official Google Play listing's Open Graph image after verifying the app title.
- Kakao uses the favicon served by the official Kakao Business site.
- DV360 uses the Google brand favicon served by its official Marketing Platform product resource page, not a fictitious mobile application icon.
- Exact source pages, downloaded asset URLs, media types and original byte sizes are recorded in `sources.json`.
- Original brand assets remain the property of their respective owners. The UI does not recolor, regenerate or claim authorship of these assets.
- No customer files, uploaded advertising materials, credentials or personalized account data are included. Unknown or failed assets use an unbranded generic web glyph.

## Performance/report labels

`performance-sources.json` records three additional local identification images (Netflix, YouTube and TVING), verified against the official publisher's Google Play listing. Together with the existing nine images, `MediaLabel` uses twelve locally served logos. The original nine-item app/platform registry is unchanged.

`lib/media-identity.ts` matches explicit display aliases only. It does not normalize, merge or modify report data. Combined/unknown labels never inherit another brand by substring matching. Other media and image-load errors use non-branded monogram badges with the full original media name alongside. Icons are decorative for assistive technology; names, numbers, links and CSV strings remain intact.

The source URLs and byte lengths are retained for auditing. Images identify the relevant services only; they do not imply endorsement or a license grant. Brand rights remain with their owners.
