/**
 * Category colors are an OKLCH lightness ladder derived from the Claude Design
 * UI spec and validated with the dataviz palette checker on both the light
 * (#fffefc) and dark (#1d1a23) card surfaces: lightness band, chroma floor,
 * normal-vision floor >= 15, CVD separation >= 6.8 (6-8 band is acceptable
 * because every chart pairs color with labels, values, and segment gaps).
 * "Other" is deliberately neutral: it is the overflow bucket, never an identity.
 */
export const defaultCategoryTaxonomy = [
  { name: "Groceries", color: "#00734b", icon: "shopping-basket" },
  { name: "Dining", color: "#b16900", icon: "utensils" },
  { name: "Transport", color: "#1e6db3", icon: "car" },
  { name: "Subscriptions", color: "#9a86d6", icon: "repeat" },
  { name: "Utilities", color: "#00a690", icon: "plug" },
  { name: "Rent/Mortgage", color: "#5d75cb", icon: "house" },
  { name: "Entertainment", color: "#ae64a8", icon: "clapperboard" },
  { name: "Healthcare", color: "#cc6660", icon: "heart-pulse" },
  { name: "Shopping", color: "#ad4975", icon: "shopping-bag" },
  { name: "Travel", color: "#6c7e1e", icon: "plane" },
  { name: "Fees/Interest", color: "#127ca3", icon: "badge-dollar-sign" },
  { name: "Income", color: "#009775", icon: "landmark" },
  { name: "Transfers", color: "#6189cb", icon: "arrow-left-right" },
  { name: "Other", color: "#827e8b", icon: "circle-ellipsis" },
] as const;
