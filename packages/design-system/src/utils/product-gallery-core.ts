// The rule behind `product-gallery:filter`, kept free of the DOM so it can be tested.
// A photo is "tagged" with a group (a colour key) or "untagged" (it fits every colour).

/** Indexes of the photos to show for `group`: its tagged photos, else the untagged ones, else every photo. */
export const visiblePhotoIndexes = (groups: readonly (string | null | undefined)[], group: string | null): number[] => {
  const all = groups.map((_, index) => index)
  if (!group) return all
  const tagged = all.filter((index) => groups[index] === group)
  if (tagged.length > 0) return tagged
  const untagged = all.filter((index) => !groups[index])
  return untagged.length > 0 ? untagged : all
}
