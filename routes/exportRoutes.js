const express = require("express");
const router = express.Router();
const db = require("../db");

// Get exported data based on filters
router.get("/", (req, res) => {
  const {
    purchaseParty,
    salesParty,
    productName,
    gradation,
    fromDate,
    toDate
  } = req.query;

  let query = `
    SELECT *
    FROM live_export_table
    WHERE 1=1
  `;

  let queryParams = [];

  // Party filters
  if (purchaseParty && salesParty) {
    query += `
      AND (
        (transaction_type = 'purchase' AND party_name = ?)
        OR
        (transaction_type = 'sales' AND party_name = ?)
      )
    `;
    queryParams.push(purchaseParty, salesParty);

  } else if (purchaseParty) {
    query += `
      AND transaction_type = 'purchase'
      AND party_name = ?
    `;
    queryParams.push(purchaseParty);

  } else if (salesParty) {
    query += `
      AND transaction_type = 'sales'
      AND party_name = ?
    `;
    queryParams.push(salesParty);
  }

  // Product filter
  if (productName) {
    query += ` AND product_name = ?`;
    queryParams.push(productName);
  }

  // Gradation filter
  if (gradation) {
    query += ` AND gradation = ?`;
    queryParams.push(gradation);
  }

  // From Date
  if (fromDate) {
    query += ` AND date >= ?`;
    queryParams.push(fromDate);
  }

  // To Date - includes the complete day
  if (toDate) {
    query += ` AND date < DATE_ADD(?, INTERVAL 1 DAY)`;
    queryParams.push(toDate);
  }

  // Sort by date first, then product
  query += ` ORDER BY date ASC, product_name ASC`;

  db.query(query, queryParams, (err, results) => {
    if (err) {
      console.error("Error fetching export data:", err);

      return res.status(500).json({
        message: "Internal server error"
      });
    }

    res.status(200).json(results);
  });
});

module.exports = router;