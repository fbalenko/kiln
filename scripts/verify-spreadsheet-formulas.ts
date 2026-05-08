import ExcelJS from "exceljs";

// Load the generated workbook and verify the formulas were stored —
// not pre-computed values.

async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile("/tmp/kiln-test-financial-model.xlsx");

  console.log("Tabs:", wb.worksheets.map((w) => w.name));
  console.log();

  // Verify Tab 2 (Pricing Model) formulas
  const pm = wb.getWorksheet("Pricing Model");
  if (!pm) throw new Error("Pricing Model tab missing");

  const checks = [
    { addr: "B4", desc: "discount % input" },
    { addr: "D3", desc: "discounted price formula" },
    { addr: "D4", desc: "effective discount formula" },
    { addr: "D5", desc: "Y1 ACV formula" },
    { addr: "D8", desc: "TCV formula" },
    { addr: "D10", desc: "margin % formula" },
  ];
  console.log("--- Tab 2 (Pricing Model) ---");
  for (const c of checks) {
    const cell = pm.getCell(c.addr);
    const v = cell.value;
    if (v && typeof v === "object" && "formula" in v) {
      console.log(`  ${c.addr} (${c.desc}): FORMULA = ${v.formula}`);
    } else {
      console.log(`  ${c.addr} (${c.desc}): VALUE = ${v} ${typeof v === "object" ? "(static input)" : ""}`);
    }
  }

  // Verify Tab 3 (ASC 606 Schedule) cross-tab formulas
  const asc = wb.getWorksheet("ASC 606 Schedule");
  if (!asc) throw new Error("ASC 606 Schedule tab missing");

  console.log();
  console.log("--- Tab 3 (ASC 606 Schedule) cross-tab refs ---");
  // First data row (after title rows + header). Title: row 1, subtitle: row 2,
  // header: row 4 (cursor=4 after addTitleRow). First data: row 5.
  for (const m of [1, 12, 24]) {
    const r = 4 + m; // header at 4, then m=1 at row 5
    const subRef = asc.getCell(`D${r}`).value;
    if (subRef && typeof subRef === "object" && "formula" in subRef) {
      const f = subRef.formula as string;
      const refsPM = f.includes("'Pricing Model'!");
      console.log(`  Month ${m} (row ${r}) D-col: ${refsPM ? "✓" : "✗"} cross-tab ref to Pricing Model`);
      if (!refsPM) console.log(`    formula was: ${f}`);
    } else {
      console.log(`  Month ${m} (row ${r}) D-col: NOT A FORMULA — value=${subRef}`);
    }
  }

  // Verify Tab 5 cross-tab to Approval Matrix
  const ar = wb.getWorksheet("Approval Routing");
  if (!ar) throw new Error("Approval Routing tab missing");
  console.log();
  console.log("--- Tab 5 (Approval Routing) cross-tab refs ---");
  // Active column is C, first data row is 5 (cursor after title+subtitle+header)
  const activeCell = ar.getCell("C5").value;
  if (activeCell && typeof activeCell === "object" && "formula" in activeCell) {
    const f = activeCell.formula as string;
    const refsMatrix = f.includes("'Approval Matrix'!");
    console.log(`  C5 active cell: ${refsMatrix ? "✓" : "✗"} cross-tab ref to Approval Matrix`);
    console.log(`    formula: ${f}`);
  }

  // Reconciliation row check
  console.log();
  console.log("--- Tab 3 reconciliation row ---");
  // Find the row with the reconciliation formula. Loop over rows.
  for (let r = 1; r < 100; r++) {
    const c = asc.getCell(`D${r}`).value;
    if (c && typeof c === "object" && "formula" in c) {
      const f = (c.formula as string) ?? "";
      if (f.startsWith("IF(ABS(SUM(G")) {
        console.log(`  D${r}: ${f.slice(0, 80)}…`);
        break;
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
