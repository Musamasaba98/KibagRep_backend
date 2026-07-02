import Holidays from "date-holidays";

const hd = new Holidays("UG");

// Returns a Set of "YYYY-MM-DD" strings that are Uganda public holidays
export function getUgandaPublicHolidays(year) {
  const holidays = hd.getHolidays(year);
  const result = new Set();
  for (const h of holidays) {
    if (h.type === "public") result.add(h.date.slice(0, 10));
  }
  return result;
}

function localISO(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function isUgandaPublicHoliday(date, holidaySet) {
  return holidaySet.has(localISO(date));
}
