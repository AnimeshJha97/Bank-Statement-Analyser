import type { BankProfile, PdfTextItem } from "./types.js";

const columns = (date: [number, number], description: [number, number], debit: [number, number], credit: [number, number], balance: [number, number]) => [
  { field: "date" as const, minX: date[0], maxX: date[1] },
  { field: "description" as const, minX: description[0], maxX: description[1] },
  { field: "debit" as const, minX: debit[0], maxX: debit[1] },
  { field: "credit" as const, minX: credit[0], maxX: credit[1] },
  { field: "balance" as const, minX: balance[0], maxX: balance[1] },
];

export const bankProfiles: BankProfile[] = [
  { id: "northstar", fingerprints: ["northstar bank", "northstar current account"], columns: columns([35, 105], [105, 330], [330, 405], [405, 480], [480, 570]), dateOrder: "DMY" },
  { id: "harbor", fingerprints: ["harbor credit union"], columns: columns([42, 125], [125, 345], [430, 500], [345, 430], [500, 575]), dateOrder: "MDY" },
  { id: "cedar", fingerprints: ["cedar savings"], columns: columns([35, 115], [115, 325], [325, 410], [410, 490], [490, 580]), dateOrder: "YMD" },
];

export const genericProfile: BankProfile = { id: "generic", fingerprints: [], columns: [], dateOrder: "DMY", yTolerance: 3 };

export function registerBankProfile(profile: BankProfile): void {
  const index = bankProfiles.findIndex(({ id }) => id === profile.id);
  if (index >= 0) bankProfiles[index] = profile; else bankProfiles.push(profile);
}

export function createHeaderFingerprint(items: PdfTextItem[]): string {
  return items.filter((item) => item.page === 1).sort((a, b) => b.y - a.y || a.x - b.x).slice(0, 18)
    .map(({ text }) => text).join(" ").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function matchBankProfile(fingerprint: string, profiles: BankProfile[] = bankProfiles): BankProfile {
  return profiles.find((profile) => profile.fingerprints.some((needle) => fingerprint.includes(needle))) ?? genericProfile;
}
