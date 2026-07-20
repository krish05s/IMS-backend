const express = require("express");
const router = express.Router();
const db = require("../db");
const authenticateAndAuthorize = require("../middleware/authMiddleware");

const query = (sql, params) =>
  new Promise((resolve, reject) => {
    db.query(sql, params, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });

// ======================================================
// CREATE CUSTOMER ORDER
// ======================================================
router.post(
  "/create",
  authenticateAndAuthorize(),
  async (req, res) => {
    const {
      date,
      bill_no,
      customer_name,
      items,
    } = req.body;

    if (!date || !bill_no || !customer_name || !items || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields or cart is empty",
      });
    }

    try {
      const basicProductCode = items[0]?.product_code || "";
      const basicQuantity = items[0]?.quantity || 0;
      
      // Mark as online order using a specific prefix in bill_no or just created_by
      const created_by = `${req.user.name} (Online)`;

      // INSERT INTO SALES (Leaving logistics blank for Admin to fill later)
      const insertResult = await query(
        `
        INSERT INTO sales
        (
          date, bill_no, customer_name, vehicle_no, driver_name, driver_number, transporter_name, lr_number, product_code, quantity, created_by, status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          date,
          bill_no,
          customer_name,
          "N/A", // vehicle_no
          "N/A", // driver_name
          "N/A", // driver_number
          "N/A", // transporter_name
          "N/A", // lr_number
          basicProductCode,
          basicQuantity,
          created_by,
          "placed",
        ]
      );

      const salesId = insertResult.insertId;

      // INSERT ITEMS
      for (const item of items) {
        const parsedQuantity = parseInt(item.quantity, 10);
        await query(
          `
          INSERT INTO sales_items
          (sales_id, product_code, product_name, gradation, quantity)
          VALUES (?, ?, ?, ?, ?)
          `,
          [
            salesId,
            item.product_code || "",
            item.product_name,
            item.gradation,
            parsedQuantity,
          ]
        );
      }

      // WRITE STATUS LOG
      await query(
        `INSERT INTO order_status_log (sales_id, from_status, to_status, actor_role, note) VALUES (?, ?, ?, ?, ?)`,
        [salesId, null, 'placed', 'system', 'Order created via Customer Portal']
      );

      res.json({
        success: true,
        message: "Order placed successfully",
        insertedId: salesId,
      });

    } catch (err) {
      console.error("Customer Order Insert Error:", err);
      res.status(500).json({
        success: false,
        message: "Failed to place order",
        error: err.message,
      });
    }
  }
);

// ======================================================
// GET MY ORDERS
// ======================================================
router.get(
  "/my-orders",
  authenticateAndAuthorize(),
  async (req, res) => {
    try {
      // Find orders matching the customer's name
      const customerName = req.user.name;

      const createdByPattern = `${customerName} (Online)`;

      const salesResults = await query(
        `
        SELECT s.*, 
        (SELECT COUNT(*) FROM sales_items si WHERE si.sales_id = s.id) as items_count
        FROM sales s 
        WHERE s.customer_name = ? OR s.created_by = ?
        ORDER BY s.id DESC
        `,
        [customerName, createdByPattern]
      );

      // We only fetch items if really needed, but items_count is usually enough for the list.
      // If we need the full item list per order:
      const itemsResults = await query(
        `SELECT * FROM sales_items WHERE sales_id IN (SELECT id FROM sales WHERE customer_name = ? OR created_by = ?)`, 
        [customerName, createdByPattern]
      );

      const salesWithItems = salesResults.map((s) => ({
        ...s,
        items: itemsResults.filter((i) => i.sales_id === s.id),
      }));

      res.json({
        success: true,
        data: salesWithItems,
      });

    } catch (err) {
      console.error("Fetch My Orders Error:", err);
      res.status(500).json({
        success: false,
        message: "DB Error",
        error: err.message,
      });
    }
  }
);

// ======================================================
// DELETE CUSTOMER ORDER
// ======================================================
router.delete(
  "/delete/:id",
  authenticateAndAuthorize(),
  async (req, res) => {
    const orderId = req.params.id;
    const customerName = req.user.name;

    try {
      // 1. Verify ownership and status
      const orders = await query("SELECT * FROM sales WHERE id = ? AND customer_name = ?", [orderId, customerName]);
      if (orders.length === 0) {
        return res.status(404).json({ success: false, message: "Order not found or unauthorized" });
      }

      const order = orders[0];
      if (order.status !== 'placed') {
        return res.status(400).json({ success: false, message: "Only placed orders can be deleted" });
      }

      // 2. Delete items
      await query("DELETE FROM sales_items WHERE sales_id = ?", [orderId]);

      // 3. Delete order
      await query("DELETE FROM sales WHERE id = ?", [orderId]);

      res.json({ success: true, message: "Order deleted successfully" });
    } catch (err) {
      console.error("Delete Order Error:", err);
      res.status(500).json({ success: false, message: "Failed to delete order", error: err.message });
    }
  }
);

module.exports = router;
