const express = require("express");
const router = express.Router();
const db = require("../db");

// Get exported data based on filters
router.get("/", (req, res) => {
  const { purchaseParty, salesParty, productName, gradation } = req.query;

  let query = `SELECT * FROM live_export_table WHERE 1=1`;
  let queryParams = [];

  if (purchaseParty && salesParty) {
    query += ` AND ((transaction_type = 'purchase' AND party_name = ?) OR (transaction_type = 'sales' AND party_name = ?))`;
    queryParams.push(purchaseParty, salesParty);
  } else if (purchaseParty) {
    query += ` AND transaction_type = 'purchase' AND party_name = ?`;
    queryParams.push(purchaseParty);
  } else if (salesParty) {
    query += ` AND transaction_type = 'sales' AND party_name = ?`;
    queryParams.push(salesParty);
  }

  if (productName) {
    query += ` AND product_name = ?`;
    queryParams.push(productName);
  }

  if (gradation) {
    query += ` AND gradation = ?`;
    queryParams.push(gradation);
  }

  query += ` ORDER BY created_at DESC`;

  db.query(query, queryParams, (err, results) => {
    if (err) {
      console.error("Error fetching export data:", err);
      return res.status(500).json({ message: "Internal server error" });
    }
    res.status(200).json(results);
  });
});

module.exports = router;
