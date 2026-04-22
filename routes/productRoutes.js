const express = require("express");
const router = express.Router();
const db = require("../db");
const authenticateAndAuthorize = require("../middleware/authMiddleware");

// Create Product
router.post("/create", authenticateAndAuthorize(), (req, res) => {
  const { product_name, gradation_id, gradation, quantity } = req.body;

  if (!product_name || !gradation_id) {
    return res.status(400).json({ success: false, message: "Product name and Gradation are required" });
  }

  // Check unique product_name + gradation
  const checkQuery = "SELECT * FROM product WHERE product_name = ? AND gradation_id = ?";
  db.query(checkQuery, [product_name, gradation_id], (err, result) => {
    if (err) return res.status(500).json({ success: false, message: "DB Error", error: err.message });
    
    if (result.length > 0) {
      return res.json({ success: false, message: "Product with this name and gradation already exists" });
    }

    // Auto generate product_code based on product_name prefix
    // e.g., "Synthetic Resin" -> "SYN"
    let prefix = "PRD";
    if (product_name && product_name.length >= 3) {
      prefix = product_name.substring(0, 3).toUpperCase().replace(/[^A-Z0-9]/g, '');
    }
    // Pad to at least 3 chars if needed
    if (prefix.length < 3) {
      prefix = prefix.padEnd(3, 'X');
    }

    const lastCodeQuery = "SELECT product_code FROM product WHERE product_code LIKE ? ORDER BY id DESC LIMIT 1";
    db.query(lastCodeQuery, [`${prefix}%`], (err, rows) => {
      if (err) return res.status(500).json({ success: false, message: "DB Error", error: err.message });

      let nextCode = prefix + "001";
      if (rows.length > 0 && rows[0].product_code) {
        const lastCode = rows[0].product_code;
        // Extract numeric part at the end
        const match = lastCode.match(/\d+$/);
        if (match) {
          let nextNum = parseInt(match[0], 10) + 1;
          nextCode = prefix + nextNum.toString().padStart(3, "0");
        }
      }

      const insertQuery = "INSERT INTO product (product_name, product_code, gradation_id, gradation, quantity) VALUES (?, ?, ?, ?, ?)";
      const prodQty = quantity || 0;
      
      db.query(insertQuery, [product_name, nextCode, gradation_id, gradation, prodQty], (err, insertResult) => {
        if (err) return res.status(500).json({ success: false, message: "Insert Error", error: err.message });
        res.json({ success: true, message: "Product created successfully", insertedId: insertResult.insertId, product_code: nextCode });
      });
    });
  });
});

// Get All Products
router.get("/read", authenticateAndAuthorize(), (req, res) => {
  db.query("SELECT * FROM product", (err, result) => {
    if (err) return res.status(500).json({ success: false, message: "DB Error", error: err.message });
    res.json({ success: true, data: result });
  });
});

// Update Product
router.put("/update/:id", authenticateAndAuthorize(), (req, res) => {
  const { id } = req.params;
  const { product_name, gradation_id, gradation, quantity } = req.body;

  if (!product_name || !gradation_id) {
    return res.status(400).json({ success: false, message: "Product name and Gradation are required" });
  }

  // Check unique product_name + gradation but ignore current id
  const checkQuery = "SELECT * FROM product WHERE product_name = ? AND gradation_id = ? AND id != ?";
  db.query(checkQuery, [product_name, gradation_id, id], (err, result) => {
    if (err) return res.status(500).json({ success: false, message: "DB Error", error: err.message });
    
    if (result.length > 0) {
      return res.json({ success: false, message: "Product with this name and gradation already exists" });
    }

    const updateQuery = "UPDATE product SET product_name=?, gradation_id=?, gradation=?, quantity=? WHERE id=?";
    const prodQty = quantity !== undefined ? quantity : 0;

    db.query(updateQuery, [product_name, gradation_id, gradation, prodQty, id], (err, updateResult) => {
      if (err) return res.status(500).json({ success: false, message: "DB Error", error: err.message });
      res.json({ success: true, message: "Product updated successfully" });
    });
  });
});

// Delete Product
router.delete("/delete/:id", authenticateAndAuthorize(), (req, res) => {
  const { id } = req.params;

  // First fetch the product code to delete related items
  db.query("SELECT product_code FROM product WHERE id = ?", [id], (err, rows) => {
    if (err) return res.status(500).json({ success: false, message: "DB Error", error: err.message });
    if (rows.length === 0) return res.json({ success: false, message: "Product not found" });

    const productCode = rows[0].product_code;

    // Delete associated purchase items
    db.query("DELETE FROM purchase_items WHERE product_code = ?", [productCode], (err2) => {
      if (err2) return res.status(500).json({ success: false, message: "Error wiping purchase history", error: err2.message });

      // Delete associated sales items
      db.query("DELETE FROM sales_items WHERE product_code = ?", [productCode], (err3) => {
        if (err3) return res.status(500).json({ success: false, message: "Error wiping sales history", error: err3.message });

        // Finally delete the physical product
        const deleteQuery = "DELETE FROM product WHERE id = ?";
        db.query(deleteQuery, [id], (err4) => {
          if (err4) return res.status(500).json({ success: false, message: "DB Error", error: err4.message });
          res.json({ success: true, message: "Product and associated history deleted successfully" });
        });
      });
    });
  });
});

module.exports = router;
