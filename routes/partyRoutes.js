const express = require("express");
const router = express.Router();
const db = require("../db");
const authenticateAndAuthorize = require("../middleware/authMiddleware");

// Helper to wrap db.query
const query = (sql, params) => new Promise((resolve, reject) => {
    db.query(sql, params, (err, result) => {
        if (err) reject(err); else resolve(result);
    });
});

// Create Party
router.post("/create", authenticateAndAuthorize("admin"), async (req, res) => {
  const { name, type, phone, address } = req.body;

  if (!name || !type) {
    return res.status(400).json({ success: false, message: "Missing required fields (name, type)" });
  }

  try {
    const insertQuery = "INSERT INTO parties (name, type, phone, address) VALUES (?, ?, ?, ?)";
    const insertResult = await query(insertQuery, [name, type, phone || "", address || ""]);
    
    res.json({ success: true, message: "Party created successfully", insertedId: insertResult.insertId });
  } catch (err) {
    console.error("Party Insert Error:", err);
    res.status(500).json({ success: false, message: "Insert Error", error: err.message });
  }
});

// Update Party
router.put("/update/:id", authenticateAndAuthorize("admin"), async (req, res) => {
  const partyId = req.params.id;
  const { name, type, phone, address } = req.body;

  if (!name || !type) {
    return res.status(400).json({ success: false, message: "Missing required fields" });
  }

  try {
    const updateQuery = "UPDATE parties SET name=?, type=?, phone=?, address=? WHERE id=?";
    await query(updateQuery, [name, type, phone || "", address || "", partyId]);
    
    res.json({ success: true, message: "Party updated successfully" });
  } catch (err) {
    console.error("Party Update Error:", err);
    res.status(500).json({ success: false, message: "Update Error", error: err.message });
  }
});

// Delete Party
router.delete("/delete/:id", authenticateAndAuthorize("admin"), async (req, res) => {
  const partyId = req.params.id;
  
  try {
    await query("DELETE FROM parties WHERE id = ?", [partyId]);
    res.json({ success: true, message: "Party deleted successfully" });
  } catch (err) {
    console.error("Party Delete Error:", err);
    res.status(500).json({ success: false, message: "Delete Error", error: err.message });
  }
});

// Get All Parties
router.get("/read", authenticateAndAuthorize(), async (req, res) => {
  const { type } = req.query;
  
  try {
    let getQuery = "SELECT * FROM parties";
    let params = [];
    
    if (type) {
      getQuery += " WHERE type = ?";
      params.push(type);
    }
    
    getQuery += " ORDER BY id DESC";
    
    const partyResults = await query(getQuery, params);
    res.json({ success: true, data: partyResults });
  } catch (err) {
    console.error("Party Fetch Error:", err);
    res.status(500).json({ success: false, message: "DB Error", error: err.message });
  }
});

module.exports = router;
