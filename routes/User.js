const express = require("express");
const router = express.Router();
const db = require("../db");
const authenticateAndAuthorize = require("../middleware/authMiddleware");


// Register User
router.post(
  "/register",
  authenticateAndAuthorize(),
  (req, res) => {
    const { name, email, mobile, date_of_birth, password, role } = req.body;

    if (!name || !email || !mobile || !password) {
      return res.status(400).json({
        success: false,
        message: "All required fields must be filled",
      });
    }

    const checkQuery = "SELECT * FROM users WHERE email = ?";

    db.query(checkQuery, [email], (err, result) => {
      if (err) {
        return res.status(500).json({
          success: false,
          message: "DB Error",
          error: err.message,
        });
      }

      if (result.length > 0) {
        return res.json({
          success: false,
          message: "Email already registered",
        });
      }

      const insertQuery = `
        INSERT INTO users
        (name, email, mobile, date_of_birth, password, role, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `;

      db.query(
        insertQuery,
        [
          name,
          email,
          mobile,
          date_of_birth,
          password,
          role || "user",
          1,
        ],
        (err, result) => {
          if (err) {
            return res.status(500).json({
              success: false,
              message: "Insert Error",
              error: err.message,
            });
          }

          res.json({
            success: true,
            message: "User registered successfully",
            insertedId: result.insertId,
          });
        }
      );
    });
  }
);


// Get All Users
router.get("/read", authenticateAndAuthorize(), (req, res) => {
  db.query("SELECT * FROM users", (err, result) => {
    if (err) {
      return res.status(500).json({
        success: false,
        message: "Database error",
        error: err.message,
      });
    }

    res.json({
      success: true,
      count: result.length,
      data: result,
    });
  });
});


// Update User
// Update User
router.put("/update/:id", authenticateAndAuthorize(), (req, res) => {
  const { id } = req.params;
  const { name, email, mobile, date_of_birth, password, role, status } = req.body;

  // Pehla existing user fetch karo
  db.query("SELECT * FROM users WHERE id = ?", [id], (err, result) => {
    if (err) return res.status(500).json({ success: false, message: "DB Error", error: err.message });
    if (result.length === 0) return res.json({ success: false, message: "User not found" });

    const existing = result[0];

    // Password: jo blank hoi to existing rakhvano, nahi to new use karvo
    const finalPassword = password && password.trim() !== "" ? password : existing.password;

    const sql = `
      UPDATE users
      SET name=?, email=?, mobile=?, date_of_birth=?, password=?, role=?, status=?
      WHERE id=?
    `;

    db.query(
      sql,
      [
        name || existing.name,
        email || existing.email,
        mobile || existing.mobile,
        date_of_birth || existing.date_of_birth,
        finalPassword,
        role || existing.role,
        status !== undefined ? status : existing.status,
        id,
      ],
      (err, result) => {
        if (err) return res.status(500).json({ success: false, message: "Database error", error: err.message });
        res.json({ success: true, message: "User updated successfully" });
      }
    );
  });
});




// Delete User
router.delete(
  "/delete/:id",
  authenticateAndAuthorize(),
  (req, res) => {
    const { id } = req.params;

    const query = "DELETE FROM users WHERE id = ?";

    db.query(query, [id], (err, result) => {
      if (err) {
        return res.status(500).json({
          success: false,
          message: "DB Error",
          error: err.message,
        });
      }

      if (result.affectedRows === 0) {
        return res.json({
          success: false,
          message: "Admin cannot be deleted OR user not found",
        });
      }

      res.json({
        success: true,
        message: "User deleted successfully",
      });
    });
  }
);


module.exports = router;