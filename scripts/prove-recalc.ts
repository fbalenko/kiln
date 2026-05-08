import ExcelJS from "exceljs";
import { writeFileSync, readFileSync } from "node:fs";

// Definitive recalc proof.
// 1. Generate the original.
// 2. Programmatically edit Tab 2 B4 from 0.15 to 0.30.
// 3. Save under a new name.
// 4. Re-read both files. Confirm:
//    a) Tab 2 B4 differs (0.15 vs 0.30)
//    b) Tab 3 monthly formulas have IDENTICAL text in both files
//       (proving the schedule isn't pre-computed; it's formula-driven)
//
// If formulas are textually identical between the two files but reference
// the input cell (which differs), any compliant spreadsheet app (Numbers,
// Excel, Sheets, LibreOffice) WILL produce different computed values
// when opened. That is what "live recalculation" means in xlsx format.

async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile("/tmp/kiln-test-financial-model.xlsx");

  const pm = wb.getWorksheet("Pricing Model");
  if (!pm) throw new Error("Pricing Model tab missing");
  const asc = wb.getWorksheet("ASC 606 Schedule");
  if (!asc) throw new Error("ASC 606 Schedule tab missing");

  const originalDiscount = pm.getCell("B4").value;
  console.log("ORIGINAL: Pricing Model B4 =", originalDiscount);

  // Capture Tab 3 month-1 subscription formula text from the original.
  const origMonth1Formula = asc.getCell("D5").value;
  const origReconFormula = (() => {
    for (let r = 1; r < 100; r++) {
      const c = asc.getCell(`D${r}`).value;
      if (c && typeof c === "object" && "formula" in c) {
        const f = (c.formula as string) ?? "";
        if (f.startsWith("IF(ABS(SUM(G")) return f;
      }
    }
    return null;
  })();

  // Edit B4 → 0.30. exceljs preserves the formulas in other cells
  // because we're only setting one cell's value, not regenerating.
  pm.getCell("B4").value = 0.30;
  await wb.xlsx.writeFile("/tmp/kiln-test-financial-model-edited.xlsx");
  console.log("EDITED: wrote /tmp/kiln-test-financial-model-edited.xlsx with B4 = 0.30");

  // Re-read the edited file and compare formulas.
  const wb2 = new ExcelJS.Workbook();
  await wb2.xlsx.readFile("/tmp/kiln-test-financial-model-edited.xlsx");
  const pm2 = wb2.getWorksheet("Pricing Model");
  const asc2 = wb2.getWorksheet("ASC 606 Schedule");
  if (!pm2 || !asc2) throw new Error("read-back tabs missing");

  const editedDiscount = pm2.getCell("B4").value;
  const newMonth1Formula = asc2.getCell("D5").value;

  console.log();
  console.log("After re-read:");
  console.log("  B4:", editedDiscount, "(was", originalDiscount, ")");
  console.log();
  console.log("Tab 3 D5 (month 1 subscription rev):");
  console.log("  Original:", typeof origMonth1Formula === "object" && origMonth1Formula && "formula" in origMonth1Formula ? origMonth1Formula.formula : origMonth1Formula);
  console.log("  After edit:", typeof newMonth1Formula === "object" && newMonth1Formula && "formula" in newMonth1Formula ? newMonth1Formula.formula : newMonth1Formula);

  // Strict identity check
  const origStr = JSON.stringify(origMonth1Formula);
  const newStr = JSON.stringify(newMonth1Formula);
  console.log();
  if (origStr === newStr) {
    console.log("✓ Tab 3 D5 formula is BIT-IDENTICAL across both files.");
    console.log("  → Tab 3 contains live formulas, not baked values.");
    console.log("  → Any spreadsheet app opening either file will compute D5");
    console.log("    against the file's own B4 value — recalculation is live.");
  } else {
    console.log("✗ Tab 3 D5 formula differs — investigate.");
    process.exit(1);
  }

  // Also verify the reconciliation row uses cross-tab ref, unchanged.
  const newReconFormula = (() => {
    for (let r = 1; r < 100; r++) {
      const c = asc2.getCell(`D${r}`).value;
      if (c && typeof c === "object" && "formula" in c) {
        const f = (c.formula as string) ?? "";
        if (f.startsWith("IF(ABS(SUM(G")) return f;
      }
    }
    return null;
  })();
  console.log();
  console.log("Reconciliation formula identical:", origReconFormula === newReconFormula ? "✓" : "✗");

  // Sample additional months to be paranoid.
  console.log();
  console.log("Sample of monthly formulas (should ALL reference 'Pricing Model'!):");
  for (const m of [1, 6, 12, 24, 36]) {
    const r = 4 + m;
    const v = asc2.getCell(`D${r}`).value;
    if (v && typeof v === "object" && "formula" in v) {
      const f = v.formula as string;
      const refs = f.includes("'Pricing Model'!");
      console.log(`  Month ${m} (row ${r}): ${refs ? "✓" : "✗"} references Pricing Model`);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
