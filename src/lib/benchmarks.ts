export const CATEGORY_BENCHMARKS: Record<string, string> = {
  "large cap": "120503",
  "mid cap": "120716",
  "small cap": "120828",
  "flexi cap": "120465",
  "hybrid": "120716",
  "debt": "120912",
  "liquid": "120912",
  "bond": "120912",
  "gilt": "120912",
  "international": "120503",
  "gold": "120828"
};

export function getBenchmarkCode(category?: string): string {
  if (!category) return "120503";

  const normalized = category.toLowerCase();

  for (const key in CATEGORY_BENCHMARKS) {
    if (normalized.includes(key)) {
      return CATEGORY_BENCHMARKS[key];
    }
  }

  return "120503";
}