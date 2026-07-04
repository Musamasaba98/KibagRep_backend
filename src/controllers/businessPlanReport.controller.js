import asyncHandler from "express-async-handler";
import ExcelJS from "exceljs";
import prisma from "../config/prisma.config.js";

const MONTH_NAMES = [
  "", "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const OUTLET_TYPE_LABELS = {
  HOSPITAL:         "Hospitals",
  CLINIC:           "Clinics",
  RETAIL_PHARMACY:  "Retail Pharmacies",
  WHOLESALE:        "Wholesalers",
};

const OUTLET_TYPES_ORDER = ["HOSPITAL", "CLINIC", "RETAIL_PHARMACY", "WHOLESALE"];

// ─── Scope helpers ────────────────────────────────────────────────────────────

async function getRepScope(user) {
  const { id, role, company_id } = user;
  if (role === "Supervisor") {
    const teams = await prisma.team.findMany({
      where: { supervisor_id: id },
      select: { id: true },
    });
    if (!teams.length) return [];
    return prisma.user.findMany({
      where: { team_id: { in: teams.map(t => t.id) }, company_id },
      select: { id: true, firstname: true, lastname: true },
    });
  }
  return prisma.user.findMany({
    where: { role: "MedicalRep", company_id },
    select: { id: true, firstname: true, lastname: true },
  });
}

// ─── Build outlet+product grid for one rep ────────────────────────────────────
// Returns: { grid, productMap }
// grid: outletKey → { outletType, meta, products: { productId → { plan, ach } } }
// productMap: productId → product_name

async function buildRepGrid(repId, month, year) {
  const start = new Date(year, month - 1, 1);
  const end   = new Date(year, month,     1);

  const plan = await prisma.salesPlan.findUnique({
    where: { user_id_month_year: { user_id: repId, month, year } },
    include: {
      lines: {
        include: {
          product:  { select: { id: true, product_name: true } },
          pharmacy: { select: { id: true, pharmacy_name: true, location: true, town: true, contact: true } },
          facility: { select: { id: true, name: true, location: true, town: true } },
        },
      },
    },
  });

  const orders = await prisma.procurementOrder.findMany({
    where: {
      user_id:    repId,
      status:     { in: ["APPROVED", "DELIVERED"] },
      order_date: { gte: start, lt: end },
    },
    include: {
      items:    { include: { product: { select: { id: true, product_name: true } } } },
      pharmacy: { select: { id: true, pharmacy_name: true, location: true, town: true, contact: true } },
      facility: { select: { id: true, name: true, location: true, town: true } },
    },
  });

  const grid = {};
  const productMap = {};

  const makeKey = (item) => {
    if (item.pharmacy_id) return `pharmacy:${item.pharmacy_id}`;
    if (item.facility_id) return `facility:${item.facility_id}`;
    return null;
  };

  const makeMeta = (item) => {
    if (item.pharmacy) return {
      name:     item.pharmacy.pharmacy_name,
      location: item.pharmacy.location ?? "",
      town:     item.pharmacy.town ?? "",
      contact:  item.pharmacy.contact ?? "",
    };
    if (item.facility) return {
      name:     item.facility.name,
      location: item.facility.location ?? "",
      town:     item.facility.town ?? "",
      contact:  "",
    };
    return null;
  };

  // Fill from plan lines
  if (plan) {
    for (const line of plan.lines) {
      const key = makeKey(line);
      if (!key) continue;
      const outletType = line.outlet_type ?? "RETAIL_PHARMACY"; // fallback for legacy lines
      productMap[line.product.id] = line.product.product_name;
      if (!grid[key]) grid[key] = { outletType, meta: makeMeta(line), products: {} };
      grid[key].products[line.product.id] = { plan: line.target_units ?? 0, ach: 0 };
    }
  }

  // Fill from orders (ACH)
  for (const order of orders) {
    const key = makeKey(order);
    if (!key) continue;
    const outletType = order.outlet_type ?? "RETAIL_PHARMACY";
    if (!grid[key]) grid[key] = { outletType, meta: makeMeta(order), products: {} };
    for (const item of order.items) {
      productMap[item.product.id] = item.product.product_name;
      if (!grid[key].products[item.product.id]) {
        grid[key].products[item.product.id] = { plan: 0, ach: 0 };
      }
      grid[key].products[item.product.id].ach += item.quantity;
    }
  }

  return { grid, productMap };
}

// ─── Sheet builder ────────────────────────────────────────────────────────────

const GREEN      = "FF16A34A";
const GREEN_LIGHT = "FFD1FAE5";
const BORDER = {
  top:    { style: "thin", color: { argb: "FFD1D5DB" } },
  left:   { style: "thin", color: { argb: "FFD1D5DB" } },
  bottom: { style: "thin", color: { argb: "FFD1D5DB" } },
  right:  { style: "thin", color: { argb: "FFD1D5DB" } },
};

function b(cell) { cell.border = BORDER; }

function buildSheet(workbook, sheetTitle, outlets, products, month, year) {
  const ws = workbook.addWorksheet(sheetTitle.slice(0, 31));
  const nProducts = products.length;
  const totalCols  = 5 + nProducts * 2 + 2; // facility + location + town + contact + supplier | nP*2 | totalPlan | totalAch

  // Row 1 — title
  ws.mergeCells(1, 1, 1, totalCols);
  const t = ws.getCell(1, 1);
  t.value     = `BUSINESS PLAN FOR ${MONTH_NAMES[month].toUpperCase()} ${year}`;
  t.font      = { bold: true, size: 12, color: { argb: "FFFFFFFF" } };
  t.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN } };
  t.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(1).height = 22;

  // Row 2 — fixed headers + merged product headers
  const h2 = ws.getRow(2);
  h2.height = 16;
  ["FACILITY", "LOCATION", "TOWN", "CONTACT", "SUPPLIER"].forEach((label, i) => {
    const c = h2.getCell(i + 1);
    c.value     = label;
    c.font      = { bold: true, size: 9 };
    c.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN_LIGHT } };
    c.alignment = { horizontal: "center", vertical: "middle" };
    b(c);
  });
  products.forEach(([, name], i) => {
    const col = 6 + i * 2;
    ws.mergeCells(2, col, 2, col + 1);
    const c = ws.getCell(2, col);
    c.value     = name.toUpperCase();
    c.font      = { bold: true, size: 9 };
    c.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN_LIGHT } };
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    b(c);
  });
  for (const col of [totalCols - 1, totalCols]) {
    const c = h2.getCell(col);
    c.value     = "TOTAL";
    c.font      = { bold: true, size: 9 };
    c.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN_LIGHT } };
    c.alignment = { horizontal: "center", vertical: "middle" };
    b(c);
  }

  // Row 3 — PLAN / ACH sub-headers
  const h3 = ws.getRow(3);
  h3.height = 13;
  for (let i = 1; i <= 5; i++) {
    const c = h3.getCell(i);
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN_LIGHT } };
    b(c);
  }
  products.forEach(([,], i) => {
    const col = 6 + i * 2;
    const planC = h3.getCell(col);
    planC.value     = "PLAN";
    planC.font      = { bold: true, size: 8, color: { argb: "FF374151" } };
    planC.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFBEB" } };
    planC.alignment = { horizontal: "center" };
    b(planC);

    const achC = h3.getCell(col + 1);
    achC.value     = "ACH";
    achC.font      = { bold: true, size: 8, color: { argb: GREEN } };
    achC.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0FDF4" } };
    achC.alignment = { horizontal: "center" };
    b(achC);
  });
  for (const col of [totalCols - 1, totalCols]) {
    const c = h3.getCell(col);
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN_LIGHT } };
    b(c);
  }

  // Data rows
  let rowNum   = 4;
  let gtPlan   = 0;
  let gtAch    = 0;

  for (const outlet of outlets) {
    const row = ws.getRow(rowNum++);
    row.height = 14;

    [outlet.meta.name, outlet.meta.location, outlet.meta.town, outlet.meta.contact, ""].forEach((v, i) => {
      const c = row.getCell(i + 1);
      c.value     = v;
      c.font      = { size: 9 };
      c.alignment = { vertical: "middle" };
      b(c);
    });

    let rowPlan = 0, rowAch = 0;
    products.forEach(([pid,], i) => {
      const col   = 6 + i * 2;
      const entry = outlet.products[pid] ?? { plan: 0, ach: 0 };

      const planC = row.getCell(col);
      planC.value     = entry.plan || null;
      planC.font      = { size: 9 };
      planC.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFBEB" } };
      planC.alignment = { horizontal: "center" };
      b(planC);

      const achC = row.getCell(col + 1);
      achC.value     = entry.ach || null;
      achC.font      = { size: 9, color: { argb: entry.ach > 0 ? GREEN : "FF9CA3AF" } };
      achC.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0FDF4" } };
      achC.alignment = { horizontal: "center" };
      b(achC);

      rowPlan += entry.plan;
      rowAch  += entry.ach;
    });

    const rpc = row.getCell(totalCols - 1);
    rpc.value     = rowPlan || null;
    rpc.font      = { bold: true, size: 9 };
    rpc.alignment = { horizontal: "center" };
    b(rpc);

    const rac = row.getCell(totalCols);
    rac.value     = rowAch || null;
    rac.font      = { bold: true, size: 9, color: { argb: rowAch > 0 ? GREEN : "FF9CA3AF" } };
    rac.alignment = { horizontal: "center" };
    b(rac);

    gtPlan += rowPlan;
    gtAch  += rowAch;
  }

  // TOTAL row
  const tr = ws.getRow(rowNum);
  tr.height = 15;
  ws.mergeCells(rowNum, 1, rowNum, 5);
  const tlc = tr.getCell(1);
  tlc.value     = "TOTAL";
  tlc.font      = { bold: true, size: 10 };
  tlc.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN_LIGHT } };
  tlc.alignment = { horizontal: "right", vertical: "middle" };
  b(tlc);

  products.forEach(([pid,], i) => {
    const col  = 6 + i * 2;
    const pSum = outlets.reduce((s, o) => s + (o.products[pid]?.plan ?? 0), 0);
    const aSum = outlets.reduce((s, o) => s + (o.products[pid]?.ach  ?? 0), 0);

    const pc = tr.getCell(col);
    pc.value = pSum || null; pc.font = { bold: true, size: 9 };
    pc.fill  = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN_LIGHT } };
    pc.alignment = { horizontal: "center" }; b(pc);

    const ac = tr.getCell(col + 1);
    ac.value = aSum || null; ac.font = { bold: true, size: 9, color: { argb: GREEN } };
    ac.fill  = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN_LIGHT } };
    ac.alignment = { horizontal: "center" }; b(ac);
  });

  const gpc = tr.getCell(totalCols - 1);
  gpc.value = gtPlan || null; gpc.font = { bold: true, size: 10 };
  gpc.fill  = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN_LIGHT } };
  gpc.alignment = { horizontal: "center" }; b(gpc);

  const gac = tr.getCell(totalCols);
  gac.value = gtAch || null; gac.font = { bold: true, size: 10, color: { argb: GREEN } };
  gac.fill  = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN_LIGHT } };
  gac.alignment = { horizontal: "center" }; b(gac);

  // Column widths
  ws.getColumn(1).width = 26;
  ws.getColumn(2).width = 18;
  ws.getColumn(3).width = 14;
  ws.getColumn(4).width = 15;
  ws.getColumn(5).width = 12;
  products.forEach((_, i) => {
    ws.getColumn(6 + i * 2).width     = 7;
    ws.getColumn(6 + i * 2 + 1).width = 7;
  });
  ws.getColumn(totalCols - 1).width = 9;
  ws.getColumn(totalCols).width     = 9;

  return { totalPlan: gtPlan, totalAch: gtAch, outletCount: outlets.length };
}

// ─── Route handler ────────────────────────────────────────────────────────────

export const businessPlanReport = asyncHandler(async (req, res) => {
  const { id: requesterId, role, company_id } = req.user;
  const month  = parseInt(req.query.month)  || new Date().getMonth() + 1;
  const year   = parseInt(req.query.year)   || new Date().getFullYear();
  const repId  = req.query.rep_id ?? null;

  let reps;
  if (repId) {
    const rep = await prisma.user.findUnique({
      where: { id: repId },
      select: { id: true, firstname: true, lastname: true, company_id: true },
    });
    if (!rep || rep.company_id !== company_id) {
      return res.status(403).json({ success: false, error: "Rep not in your company" });
    }
    reps = [rep];
  } else {
    reps = await getRepScope(req.user);
  }

  if (!reps.length) {
    return res.status(404).json({ success: false, error: "No reps in scope" });
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "KibagRep";
  workbook.created = new Date();

  // For each rep, build their grid and populate the 4 sheets
  // Multi-rep: we merge all reps into the same 4 sheets, with a "REP" column added — actually simpler to have one set of 4 sheets that aggregate all reps in scope, showing per-outlet data
  // For single-rep: straight 4 sheets
  // For multi-rep: per-rep 4 sheets (named "Rep Name — Hospitals" etc.) plus a summary

  const repSummaries = [];

  for (const rep of reps) {
    const repLabel = `${rep.firstname} ${rep.lastname}`;
    const { grid, productMap } = await buildRepGrid(rep.id, month, year);

    const products = Object.entries(productMap); // [[id, name], ...]
    if (!products.length) {
      repSummaries.push({ name: repLabel, outletCount: 0, totalPlan: 0, totalAch: 0 });
      continue;
    }

    let repPlan = 0, repAch = 0, repOutlets = 0;

    for (const outletType of OUTLET_TYPES_ORDER) {
      const outlets = Object.values(grid).filter(o => o.outletType === outletType);
      if (!outlets.length) continue;

      const label = reps.length === 1
        ? OUTLET_TYPE_LABELS[outletType]
        : `${repLabel} — ${OUTLET_TYPE_LABELS[outletType]}`;

      const result = buildSheet(workbook, label, outlets, products, month, year);
      repPlan    += result.totalPlan;
      repAch     += result.totalAch;
      repOutlets += result.outletCount;
    }

    repSummaries.push({ name: repLabel, outletCount: repOutlets, totalPlan: repPlan, totalAch: repAch });
  }

  // Summary sheet for multi-rep
  if (reps.length > 1) {
    const ws = workbook.addWorksheet("Summary");
    ws.mergeCells("A1:F1");
    const t = ws.getCell("A1");
    t.value     = `TEAM BUSINESS PLAN — ${MONTH_NAMES[month].toUpperCase()} ${year}`;
    t.font      = { bold: true, size: 12, color: { argb: "FFFFFFFF" } };
    t.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN } };
    t.alignment = { horizontal: "center", vertical: "middle" };
    ws.getRow(1).height = 20;

    ["#", "REP", "OUTLETS", "PLAN (units)", "ACH (units)", "ACH %"].forEach((h, i) => {
      const c = ws.getRow(2).getCell(i + 1);
      c.value     = h;
      c.font      = { bold: true, size: 10 };
      c.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: GREEN_LIGHT } };
      c.alignment = { horizontal: "center", vertical: "middle" };
      b(c);
    });
    ws.getRow(2).height = 15;

    repSummaries.forEach(({ name, outletCount, totalPlan, totalAch }, idx) => {
      const pct = totalPlan > 0 ? Math.round((totalAch / totalPlan) * 100) : null;
      const vals = [idx + 1, name, outletCount, totalPlan || null, totalAch || null, pct != null ? `${pct}%` : "—"];
      const row  = ws.getRow(3 + idx);
      vals.forEach((v, i) => {
        const c = row.getCell(i + 1);
        c.value     = v;
        c.font      = { size: 10, ...(i === 5 && pct != null ? { color: { argb: pct >= 90 ? GREEN : pct >= 60 ? "FFF59E0B" : "FFDC2626" } } : {}) };
        c.alignment = { horizontal: i === 1 ? "left" : "center", vertical: "middle" };
        b(c);
      });
      row.height = 14;
    });

    ws.getColumn(1).width = 5;
    ws.getColumn(2).width = 24;
    ws.getColumn(3).width = 12;
    ws.getColumn(4).width = 15;
    ws.getColumn(5).width = 15;
    ws.getColumn(6).width = 10;

    // Move summary to front
    const sumIdx = workbook.worksheets.findIndex(s => s.name === "Summary");
    if (sumIdx > 0) {
      const [sumSheet] = workbook.worksheets.splice(sumIdx, 1);
      workbook.worksheets.unshift(sumSheet);
    }
  }

  const monthLabel = MONTH_NAMES[month];
  const scopeLabel = reps.length === 1
    ? `${reps[0].firstname}_${reps[0].lastname}`
    : "Team";

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="Business_Plan_${scopeLabel}_${monthLabel}_${year}.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
});
