import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { PNG } from "pngjs";

const directory = fileURLToPath(new URL("./fixtures/pdf/", import.meta.url));
await mkdir(directory, { recursive: true });

async function digital(name, bank, headers, xs, rows) {
  const document = await PDFDocument.create(); const page = document.addPage([612, 792]); const font = await document.embedFont(StandardFonts.Helvetica);
  page.drawText(bank, { x: 35, y: 750, size: 18, font }); page.drawText("Account statement", { x: 35, y: 725, size: 10, font });
  headers.forEach((text, index) => page.drawText(text, { x: xs[index], y: 680, size: 9, font }));
  rows.forEach((row, rowIndex) => row.forEach((text, columnIndex) => page.drawText(text, { x: xs[columnIndex], y: 650 - rowIndex * 24, size: 9, font })));
  await writeFile(`${directory}/${name}.pdf`, await document.save());
}

await digital("northstar", "Northstar Bank", ["Date", "Description", "Debit", "Credit", "Balance"], [40, 120, 345, 420, 500], [
  ["16/06/2026", "Corner Market", "42.50", "", "957.50"], ["17/06/2026", "Salary", "", "1200.00", "2157.50"],
]);
await digital("harbor", "Harbor Credit Union", ["Posted", "Memo", "Deposit", "Withdrawal", "Balance"], [45, 135, 365, 445, 515], [
  ["06/18/2026", "Book Store", "", "18.25", "981.75"], ["06/19/2026", "Refund", "30.00", "", "1011.75"],
]);
await digital("generic", "Unknown Community Bank", ["Transaction Date", "Narrative", "Amount", "Running Balance"], [40, 140, 410, 510], [
  ["2026-06-20", "Coffee House", "-5.75", "994.25"], ["2026-06-21", "Transfer In", "250.00", "1244.25"],
]);

const png = new PNG({ width: 612, height: 792, colorType: 2 });
png.data.fill(255);
for (let y = 80; y < 715; y++) for (let x = 30; x < 580; x++) if ((y % 120) < 2) { const offset = (y * 612 + x) * 4; png.data[offset] = 220; png.data[offset + 1] = 220; png.data[offset + 2] = 220; png.data[offset + 3] = 255; }
const scanned = await PDFDocument.create(); const scannedPage = scanned.addPage([612, 792]); const image = await scanned.embedPng(PNG.sync.write(png)); scannedPage.drawImage(image, { x: 0, y: 0, width: 612, height: 792 });
await writeFile(`${directory}/scanned.pdf`, await scanned.save());
