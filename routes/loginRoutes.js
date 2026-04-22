const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const db = require("../db");

const authenticateAndAuthorize = require("../middleware/authMiddleware");
const JWT_SECRET = process.env.JWT_SECRET;


// ================= LOGIN API ================= 
router.post("/login", (req, res) => {
  const { email, password } = req.body;

  const query = "SELECT * FROM users WHERE email = ?";

  db.query(query, [email], (err, result) => {
    if (err) return res.json({ success: false, message: "DB Error" });

    if (result.length === 0) {
      return res.json({ success: false, message: "User not found" });
    }

    const user = result[0];

    // ✅ STATUS CHECK ADD
    if (user.status === 0) {
      return res.json({
        success: false,
        message: "Your account is inactive. Contact admin.",
      });
    }

    // Password check
    if (user.password !== password) {
      return res.json({ success: false, message: "Invalid password" });
    }

    // Token generate
    const token = jwt.sign(
      { id: user.id, role: user.role, name: user.name, email: user.email },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.json({
      success: true,
      message: "Login successful",
      token: token,
    });
  });
});
module.exports = router;