const express = require("express");
const router = express.Router();
const db = require("../db");
const authenticateAndAuthorize = require("../middleware/authMiddleware");

// Search vehicle owner by vehicle number
router.get("/search/:vehicle_no", authenticateAndAuthorize(), (req, res) => {
  const { vehicle_no } = req.params;
  
  if (!vehicle_no) {
    return res.status(400).json({ success: false, message: "Vehicle number is required" });
  }

  // Only return active vehicles for the auto-fill via this endpoint? Wait, let's allow finding all, but setup toggles whether it appears in lists
  const query = "SELECT owner_name FROM vehicles WHERE vehicle_no = ?";
  db.query(query, [vehicle_no], async (err, result) => {
    if (err) return res.status(500).json({ success: false, message: "DB Error", error: err.message });
    
    if (result.length > 0) {
      // Found in local memory!
      res.json({ success: true, owner_name: result[0].owner_name });
    } else {
      // EXTERNAL RTO API INTEGRATION: MASTERS INDIA
      const apiKey = process.env.MASTERS_INDIA_API_KEY;
      if (apiKey && apiKey !== "put_your_master_india_key_here") {
        try {
          const externalRes = await fetch("https://api.mastersindia.co/v1/custom/verification/rc", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${apiKey}`
            },
            body: JSON.stringify({ registration_number: vehicle_no })
          });
          
          const externalData = await externalRes.json();
          const owner = externalData?.data?.owner_name || externalData?.results?.owner_name;
          
          if (owner) {
             return res.json({ success: true, owner_name: owner, source: "external" });
          }
        } catch (externalErr) {
           console.error("Master India API failed:", externalErr.message);
        }
      }
      
      res.json({ success: false, message: "Vehicle not found. Please enter owner name manually to save." });
    }
  });
});

// Read all vehicles mapping
router.get("/read", authenticateAndAuthorize(), (req, res) => {
  const query = "SELECT * FROM vehicles ORDER BY vehicle_no ASC";
  db.query(query, (err, result) => {
    if (err) return res.status(500).json({ success: false, message: "DB Error", error: err.message });
    res.json({ success: true, data: result });
  });
});

// Create vehicle
router.post("/create", authenticateAndAuthorize(), (req, res) => {
  const { vehicle_no, owner_name, status } = req.body;
  if (!vehicle_no || !owner_name) {
    return res.status(400).json({ success: false, message: "Missing fields" });
  }

  const insertQuery = "INSERT IGNORE INTO vehicles (vehicle_no, owner_name, status) VALUES (?, ?, ?)";
  db.query(insertQuery, [vehicle_no, owner_name, status !== undefined ? status : 1], (err) => {
     if (err) return res.status(500).json({ success: false, message: "DB Error", error: err.message });
     res.json({ success: true, message: "Vehicle mapped successfully." });
  });
});

// Update vehicle
router.put("/update/:vehicle_no", authenticateAndAuthorize(), (req, res) => {
  const { vehicle_no } = req.params;
  const { owner_name, status } = req.body;

  const updateQuery = "UPDATE vehicles SET owner_name = ?, status = ? WHERE vehicle_no = ?";
  db.query(updateQuery, [owner_name, status !== undefined ? status : 1, vehicle_no], (err) => {
     if (err) return res.status(500).json({ success: false, message: "DB Error", error: err.message });
     res.json({ success: true, message: "Vehicle updated successfully." });
  });
});

module.exports = router;
