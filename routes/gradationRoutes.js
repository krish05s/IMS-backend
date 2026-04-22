const express = require("express");
const router = express.Router();
const db = require("../db");
const authenticateAndAuthorize = require("../middleware/authMiddleware");

// Create Gradation
router.post("/create", authenticateAndAuthorize(), (req, res) => {
  const { gradation } = req.body;

  if (!gradation) {
    return res.status(400).json({ success: false, message: "Gradation name is required" });
  }

  const checkQuery = "SELECT * FROM gradation WHERE gradation = ?";
  db.query(checkQuery, [gradation], (err, result) => {
    if (err) return res.status(500).json({ success: false, message: "DB Error", error: err.message });
    
    if (result.length > 0) {
      return res.json({ success: false, message: "Gradation already exists" });
    }

    const insertQuery = "INSERT INTO gradation (gradation, status) VALUES (?, ?)";
    db.query(insertQuery, [gradation, 1], (err, result) => {
      if (err) return res.status(500).json({ success: false, message: "Insert Error", error: err.message });
      res.json({ success: true, message: "Gradation created successfully", insertedId: result.insertId });
    });
  });
});

// Get All Gradations
router.get("/read", authenticateAndAuthorize(), (req, res) => {
  db.query("SELECT * FROM gradation", (err, result) => {
    if (err) return res.status(500).json({ success: false, message: "DB Error", error: err.message });
    res.json({ success: true, data: result });
  });
});

// Update Gradation
router.put("/update/:id", authenticateAndAuthorize(), (req, res) => {
  const { id } = req.params;
  const { gradation } = req.body;

  if (!gradation) {
    return res.status(400).json({ success: false, message: "Gradation name is required" });
  }

  const updateQuery = "UPDATE gradation SET gradation = ? WHERE id = ?";
  db.query(updateQuery, [gradation, id], (err, result) => {
    if (err) return res.status(500).json({ success: false, message: "DB Error", error: err.message });
    res.json({ success: true, message: "Gradation updated successfully" });
  });
});

// Toggle Status
router.put("/status/:id", authenticateAndAuthorize(), (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const updateQuery = "UPDATE gradation SET status = ? WHERE id = ?";
  db.query(updateQuery, [status, id], (err, result) => {
    if (err) return res.status(500).json({ success: false, message: "DB Error", error: err.message });
    res.json({ success: true, message: "Status updated successfully" });
  });
});

module.exports = router;
