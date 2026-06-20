export function formatRating(rating: number): string {
  const fullStars = Math.floor(rating);
  const hasHalfStar = rating % 1 !== 0;

  return `${"★".repeat(fullStars)}${hasHalfStar ? "½" : ""}`;
}
