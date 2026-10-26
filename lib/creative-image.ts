import type { PlacementProof } from "./placement-proof";

export const CREATIVE_IMAGE_PURPOSE = "creative_reference";
export function creativeImageUrl(proof?: PlacementProof) {
  if (!proof?.creativeImagePath) return "";
  return "/api/reporting/proof-image?" + new URLSearchParams({ advertiser: proof.advertiser, path: proof.creativeImagePath });
}
/** Reject ambiguous batches instead of silently assigning the first file to a placement. */
export function singleCreativeImage(files: ArrayLike<File>): File | undefined {
  return files.length === 1 ? files[0] : undefined;
}
