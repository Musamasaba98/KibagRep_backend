import {
    setColumnWidths,
    addCellBorders,
    mergeAndFormatHeader,
    setCellAlignment,
    addHeaders,
    addDataRows,
    addWorksheet,
    addProductHeaders,
  } from "./excel.util.js";

// ─── Day sheet (Veeram format) ────────────────────────────────────────────────
// headerInfo: { name, date, place }
// mainHeaders: ["S.NO","CODE","DOCTOR'S NAME","SPLTY","FACILITY","Focus Product","BRANDS PROMOTED..."]
// products: string[] of abbreviations e.g. ["ARC","NFX","RFX"]
// data: rows array — each row maps to one doctor visit
export const createWorksheet = async (workbook, sheetName, headerInfo, mainHeaders, products, data) => {
  const worksheet = addWorksheet(workbook, sheetName);
  try {
    mergeAndFormatHeader(worksheet, "A1", "C1", `NAME: ${headerInfo.name}`);
    worksheet.getCell("A1").alignment = "";
    mergeAndFormatHeader(worksheet, "D1", "E1", `Date: ${headerInfo.date}`);
    worksheet.getCell("D1").alignment = "";
    mergeAndFormatHeader(worksheet, "F1", "H1", `PLACE: ${headerInfo.place}`);
    worksheet.getCell("F1").alignment = "";
    mergeAndFormatHeader(worksheet, "I1", "Q1", "WORKED WITH:");
    worksheet.getCell("I1").alignment = "";

    setColumnWidths(worksheet, [10, 10, 20, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10]);
    addCellBorders(worksheet, 37, 17);

    mergeAndFormatHeader(worksheet, "G2", "Q2", "");
    const gCell = worksheet.getCell(2, 7);
    setCellAlignment(gCell, { horizontal: "center" });

    addHeaders(worksheet, mainHeaders, 2, { horizontal: "center", vertical: "middle" }, true);
    addProductHeaders(worksheet, products, 3, { horizontal: "center" }, true);
    addDataRows(worksheet, data, 4, 1);

    return worksheet;
  } catch (error) {
    console.error("Error adding Excel sheet:", error);
    throw new Error(error);
  }
};

// ─── Feedback section (rows 23–28) ───────────────────────────────────────────
// feedbackValues: { sampledToday, cumulativeDoctors, cumulativeAvg, cumulativeFocusDrs }
export const generateFeedbackSection = (worksheet, rowOffset, feedbackValues = {}) => {
  mergeAndFormatHeader(worksheet, `A${rowOffset}`, `C${rowOffset}`, "FEEDBACK");

  const feedbackRows = [
    { label: "Opening Qty Samples",         value: feedbackValues.openingQty      ?? "" },
    { label: "Sampled for the day",          value: feedbackValues.sampledToday    ?? "" },
    { label: "Balance Samples in hand",      value: feedbackValues.balanceSamples  ?? "" },
    { label: "Drs Met Cummulative",          value: feedbackValues.cumulativeDoctors ?? "" },
    { label: "Cummulative call average",     value: feedbackValues.cumulativeAvg   ?? "" },
    { label: "Cummulative focus Drs met",    value: feedbackValues.cumulativeFocusDrs ?? "" },
  ];

  feedbackRows.forEach(({ label, value }, index) => {
    mergeAndFormatHeader(worksheet, `D${rowOffset + index}`, `E${rowOffset + index}`, label);
    worksheet.getCell(`D${rowOffset + index}`).alignment = "";
    if (value !== "") {
      worksheet.getCell(`F${rowOffset + index}`).value = value;
      worksheet.getCell(`F${rowOffset + index}`).font  = { bold: true };
    }
  });

  mergeAndFormatHeader(worksheet, `A${rowOffset + 6}`, `Q${rowOffset + 6}`, "PHARMACY COVERAGE");
  worksheet.getCell(`A${rowOffset + 6}`).alignment = { horizontal: "center" };
};

// ─── Pharmacy coverage section (row 30+) ─────────────────────────────────────
// productAbbrs: string[] e.g. ["ARC","RFX","SNG"]
// pharmacyRows: [{ name, contact, stock: { [abbr]: qty } }]
export const generatePharmacyCoverageSection = (worksheet, rowOffset, productAbbrs = ["ARC","RFX","SNG","EXPECT"], pharmacyRows = []) => {
  const pharmacyHeaders = [
    "PHARMACY NAME",
    "CHEMIST / DISPENSER NAME",
    "CONTACT",
    "FOCUS BRANDS AVAILABILITY",
  ];

  mergeAndFormatHeader(worksheet, `G${rowOffset}`, `Q${rowOffset}`, "");
  mergeAndFormatHeader(worksheet, `A${rowOffset}`, `B${rowOffset + 1}`, "");
  worksheet.getCell(`A${rowOffset}`).alignment = { vertical: "middle" };
  mergeAndFormatHeader(worksheet, `C${rowOffset}`, `D${rowOffset + 1}`, "");
  worksheet.getCell(`C${rowOffset}`).alignment = { vertical: "middle" };
  mergeAndFormatHeader(worksheet, `E${rowOffset}`, `F${rowOffset + 1}`, "");

  pharmacyHeaders.forEach((header, index) => {
    const cell = worksheet.getCell(rowOffset, index * 2 + 1);
    cell.value = header;
    cell.alignment = { horizontal: "center", vertical: "middle" };
  });

  productAbbrs.forEach((product, index) => {
    const cell = worksheet.getCell(rowOffset + 1, 7 + index);
    cell.value = product;
    cell.font = { bold: true };
    cell.alignment = { horizontal: "center", vertical: "middle" };
  });

  // Data rows
  if (pharmacyRows.length === 0) {
    // Empty rows for manual fill (original Veeram style — 8 blank rows)
    for (let i = rowOffset + 2; i <= rowOffset + 9; i++) {
      mergeAndFormatHeader(worksheet, `A${i}`, `B${i}`, "");
      mergeAndFormatHeader(worksheet, `C${i}`, `D${i}`, "");
      mergeAndFormatHeader(worksheet, `E${i}`, `F${i}`, "");
    }
  } else {
    pharmacyRows.forEach((pharm, idx) => {
      const r = rowOffset + 2 + idx;
      mergeAndFormatHeader(worksheet, `A${r}`, `B${r}`, pharm.name ?? "");
      worksheet.getCell(`A${r}`).alignment = { horizontal: "left", vertical: "middle" };
      mergeAndFormatHeader(worksheet, `C${r}`, `D${r}`, pharm.contact ?? "");
      worksheet.getCell(`C${r}`).alignment = { horizontal: "left", vertical: "middle" };
      mergeAndFormatHeader(worksheet, `E${r}`, `F${r}`, "");

      productAbbrs.forEach((abbr, i) => {
        const cell = worksheet.getCell(r, 7 + i);
        const qty = (pharm.stock ?? {})[abbr] ?? "";
        cell.value = qty;
        cell.alignment = { horizontal: "center", vertical: "middle" };
        if (qty > 0) cell.font = { bold: true };
      });
    });
    // Fill remaining blank rows up to at least 8
    const filled = pharmacyRows.length;
    for (let i = filled; i < 8; i++) {
      const r = rowOffset + 2 + i;
      mergeAndFormatHeader(worksheet, `A${r}`, `B${r}`, "");
      mergeAndFormatHeader(worksheet, `C${r}`, `D${r}`, "");
      mergeAndFormatHeader(worksheet, `E${r}`, `F${r}`, "");
    }
  }
};
