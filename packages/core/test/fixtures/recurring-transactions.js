export const recurringTransactionHistory = [
  // Genuine monthly subscription; small price movement stays inside the 3% amount band.
  { date: "2025-03-17", description: "VISA STREAMFLIX.COM REF 8831", amount: -1599 },
  { date: "2025-04-16", description: "STREAMFLIX.COM", amount: -1599 },
  { date: "2025-05-16", description: "STREAMFLIX.COM", amount: -1625 },
  { date: "2025-06-15", description: "STREAMFLIX.COM", amount: -1625 },

  // Genuine annual subscription.
  { date: "2023-06-02", description: "ACME CLOUD ANNUAL", amount: -9900 },
  { date: "2024-06-01", description: "ACME CLOUD ANNUAL", amount: -9900 },
  { date: "2025-06-01", description: "ACME CLOUD ANNUAL", amount: -9900 },

  // Repeat purchases, but the intervals do not cluster around a supported cadence.
  { date: "2025-01-03", description: "CORNER BOOK SHOP", amount: -2499 },
  { date: "2025-01-22", description: "CORNER BOOK SHOP", amount: -2499 },
  { date: "2025-03-11", description: "CORNER BOOK SHOP", amount: -2499 },
  { date: "2025-06-20", description: "CORNER BOOK SHOP", amount: -2499 },

  // Previously monthly, but its expected March charge never arrived.
  { date: "2024-12-10", description: "TST* OLD FITNESS CLUB", amount: -4500 },
  { date: "2025-01-09", description: "OLD FITNESS CLUB", amount: -4500 },
  { date: "2025-02-08", description: "OLD FITNESS CLUB", amount: -4500 },
];
