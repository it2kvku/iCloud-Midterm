// Run manually with an administrative account in mongosh against Atlas.
// Runtime books users intentionally have no update permission.
// Re-running is safe: totals are recalculated from the original price.
const studentId = '23IT139';
const vat = Number(studentId.at(-1)) + 6;
const target = db.getSiblingDB(`DB_${studentId}`);
const result = target.books.updateMany(
  { code: /^139/, price: { $type: 'number', $gte: 1, $lte: 999999999 } },
  [
    { $set: { vat, tax: { $floor: { $add: [{ $divide: [{ $multiply: ['$price', vat] }, 100] }, 0.5] } } } },
    { $set: { total: { $add: ['$price', '$tax'] } } },
  ],
);
printjson({ matched: result.matchedCount, updated: result.modifiedCount, vat });
