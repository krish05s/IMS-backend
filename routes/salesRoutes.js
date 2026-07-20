const express = require("express");
const router = express.Router();
const db = require("../db");
const authenticateAndAuthorize = require("../middleware/authMiddleware");

// ======================================================
// QUERY HELPER
// ======================================================

const query = (sql, params) =>
  new Promise((resolve, reject) => {
    db.query(sql, params, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });

// ======================================================
// CREATE SALE
// ======================================================

router.post(
  "/create",
  authenticateAndAuthorize(),
  async (req, res) => {

    const {
      date,
      bill_no,
      customer_name,
      vehicle_no,
      driver_name,
      driver_number,
      transporter_name,
      lr_number,
      items,
    } = req.body;

    if (
      !date ||
      !bill_no ||
      !customer_name ||
      !driver_name
    ) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    try {

      const itemsToProcess = items || [];

      // =========================
      // AUTO STATUS
      // =========================

      const autoStatus = "pending";

      const basicProductCode =
        itemsToProcess[0]?.product_code || "";

      const basicQuantity =
        itemsToProcess[0]?.quantity || 0;

      const created_by = req.user.name;

      // =========================
      // CREATE SALE
      // =========================

      const insertResult = await query(
        `
        INSERT INTO sales
        (
          date,
          bill_no,
          customer_name,
          vehicle_no,
          driver_name,
          driver_number,
          transporter_name,
          lr_number,
          product_code,
          quantity,
          created_by,
          status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          date,
          bill_no,
          customer_name,
          vehicle_no || "",
          driver_name,
          driver_number || "",
          transporter_name || "",
          lr_number || "",
          basicProductCode,
          basicQuantity,
          created_by,
          autoStatus,
        ]
      );

      const salesId = insertResult.insertId;

      // =========================
      // INSERT ITEMS
      // =========================

      for (const item of itemsToProcess) {

        const parsedQuantity = parseInt(
          item.quantity,
          10
        );

        // INSERT ITEM

        await query(
          `
          INSERT INTO sales_items
          (
            sales_id,
            product_code,
            product_name,
            gradation,
            quantity
          )
          VALUES (?, ?, ?, ?, ?)
          `,
          [
            salesId,
            item.product_code,
            item.product_name,
            item.gradation,
            parsedQuantity,
          ]
        );

        // REMOVE STOCK
        // Deferred until status is changed to 'packed'

      }

      // WRITE STATUS LOG
      await query(
        `INSERT INTO order_status_log (sales_id, from_status, to_status, actor_role, note) VALUES (?, ?, ?, ?, ?)`,
        [salesId, null, 'pending', 'admin', 'Order created manually by Admin']
      );

      res.json({
        success: true,
        message: "Sale created successfully",
        insertedId: salesId,
      });

    } catch (err) {

      console.error(
        "Sales Insert Error:",
        err
      );

      res.status(500).json({
        success: false,
        message: "Insert Error",
        error: err.message,
      });

    }

  }
);

// ======================================================
// UPDATE SALE
// ======================================================

router.put(
  "/update/:id",
  authenticateAndAuthorize(),
  async (req, res) => {

    const saleId = req.params.id;

    const {
      date,
      bill_no,
      customer_name,
      vehicle_no,
      driver_name,
      driver_number,
      transporter_name,
      lr_number,
      items,
    } = req.body;

    const itemsToProcess = items || [];

    if (
      !date ||
      !bill_no ||
      !customer_name ||
      !driver_name
    ) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    try {

      // =========================
      // GET CURRENT SALE
      // =========================
      const currentSale = await query(
        `SELECT status FROM sales WHERE id = ?`,
        [saleId]
      );

      if (currentSale.length === 0) {
        return res.status(404).json({ success: false, message: "Sale not found" });
      }

      const currentStatus = currentSale[0].status;
      const isStockDeducted = currentStatus === 'stock_out' || currentStatus === 'completed';

      let oldItems = [];

      if (isStockDeducted) {
        // =========================
        // GET OLD ITEMS & RETURN OLD STOCK
        // =========================
        oldItems = await query(`SELECT * FROM sales_items WHERE sales_id = ?`, [saleId]);

        for (const old of oldItems) {
          await query(
            `UPDATE product SET quantity = quantity + ? WHERE product_code = ?`,
            [old.quantity, old.product_code]
          );
        }
        
        // NO NEED TO VALIDATE OR DEDUCT NEW STOCK BECAUSE STATUS WILL BE RESET TO PENDING
      }

      // =========================
      // DELETE OLD ITEMS
      // =========================
      await query(`DELETE FROM sales_items WHERE sales_id = ?`, [saleId]);

      // =========================
      // UPDATE SALES INFO AND RESET STATUS TO PENDING IF EDITED
      // =========================
      // If we edit a sale that already had stock deducted, we reset it to pending
      // so the user has to explicitly dispatch it again.
      const newStatus = isStockDeducted ? 'pending' : currentStatus;
      
      const basicProductCode = itemsToProcess[0]?.product_code || "";
      const basicQuantity = itemsToProcess[0]?.quantity || 0;

      await query(
        `
        UPDATE sales
        SET date=?, bill_no=?, customer_name=?, vehicle_no=?, driver_name=?, driver_number=?, transporter_name=?, lr_number=?, product_code=?, quantity=?, status=?
        WHERE id=?
        `,
        [date, bill_no, customer_name, vehicle_no || "", driver_name, driver_number || "", transporter_name || "", lr_number || "", basicProductCode, basicQuantity, newStatus, saleId]
      );

      // =========================
      // INSERT NEW ITEMS 
      // =========================
      for (const item of itemsToProcess) {
        const parsedQuantity = parseInt(item.quantity, 10);

        await query(
          `
          INSERT INTO sales_items (sales_id, product_code, product_name, gradation, quantity)
          VALUES (?, ?, ?, ?, ?)
          `,
          [saleId, item.product_code, item.product_name, item.gradation, parsedQuantity]
        );

        // DO NOT DEDUCT STOCK HERE anymore.
        // It's handled strictly by PUT /update-status/:id
      }

      res.json({
        success: true,
        message: "Sale updated successfully",
      });

    } catch (err) {

      console.error(
        "Sale Update Error:",
        err
      );

      res.status(500).json({
        success: false,
        message: "Update Error",
        error: err.message,
      });

    }

  }
);

// ======================================================
// DELETE SALE
// ======================================================

router.delete(
  "/delete/:id",
  authenticateAndAuthorize(),
  async (req, res) => {

    const saleId = req.params.id;

    try {

      const saleResult = await query(`SELECT status FROM sales WHERE id = ?`, [saleId]);
      if (saleResult.length === 0) {
        return res.status(404).json({ success: false, message: "Sale not found" });
      }
      const isStockDeducted = saleResult[0].status === 'stock_out' || saleResult[0].status === 'completed';

      // GET ITEMS

      const oldItems = await query(
        `
        SELECT *
        FROM sales_items
        WHERE sales_id = ?
        `,
        [saleId]
      );

      // RETURN STOCK

      if (isStockDeducted) {
        for (const old of oldItems) {
          await query(
            `
            UPDATE product
            SET quantity = quantity + ?
            WHERE product_code = ?
            `,
            [
              old.quantity,
              old.product_code,
            ]
          );
        }
      }

      // DELETE ITEMS

      await query(
        `
        DELETE FROM sales_items
        WHERE sales_id = ?
        `,
        [saleId]
      );

      // DELETE SALE

      await query(
        `
        DELETE FROM sales
        WHERE id = ?
        `,
        [saleId]
      );

      res.json({
        success: true,
        message: "Sale deleted successfully",
      });

    } catch (err) {

      console.error(
        "Sale Delete Error:",
        err
      );

      res.status(500).json({
        success: false,
        message: "Delete Error",
        error: err.message,
      });

    }

  }
);

// ======================================================
// DELETE SALE ITEM
// ======================================================

router.delete(
  "/delete-item/:itemId",
  authenticateAndAuthorize(),
  async (req, res) => {

    const itemId = req.params.itemId;

    try {

      const itemResult = await query(
        `
        SELECT *
        FROM sales_items
        WHERE id = ?
        `,
        [itemId]
      );

      if (itemResult.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Item not found",
        });
      }

      const item = itemResult[0];

      const saleResult = await query(`SELECT status FROM sales WHERE id = ?`, [item.sales_id]);
      const isStockDeducted = saleResult.length > 0 && (saleResult[0].status === 'stock_out' || saleResult[0].status === 'completed');

      // RETURN STOCK
      
      if (isStockDeducted) {
        await query(
          `
          UPDATE product
          SET quantity = quantity + ?
          WHERE product_code = ?
          `,
          [
            item.quantity,
            item.product_code,
          ]
        );
      }

      // DELETE ITEM

      await query(
        `
        DELETE FROM sales_items
        WHERE id = ?
        `,
        [itemId]
      );

      // CHECK REMAINING ITEMS

      const remainingItems = await query(
        `
        SELECT *
        FROM sales_items
        WHERE sales_id = ?
        `,
        [item.sales_id]
      );

      // AUTO STATUS

      if (remainingItems.length === 0) {

        await query(
          `
          UPDATE sales
          SET status = 'pending'
          WHERE id = ?
          `,
          [item.sales_id]
        );

      }

      res.json({
        success: true,
        message: "Item deleted successfully",
      });

    } catch (err) {

      console.error(
        "Delete Item Error:",
        err
      );

      res.status(500).json({
        success: false,
        message: "Delete Item Error",
        error: err.message,
      });

    }

  }
);

// ======================================================
// GET SALES
// ======================================================

router.get(
  "/read",
  authenticateAndAuthorize(),
  (req, res) => {

    const getQuery = `
      SELECT s.*,
      (
        SELECT COUNT(*)
        FROM sales_items si
        WHERE si.sales_id = s.id
      ) as items_count
      FROM sales s
      ORDER BY s.id DESC
    `;

    db.query(
      getQuery,
      (err, salesResults) => {

        if (err) {
          return res.status(500).json({
            success: false,
            message: "DB Error",
            error: err.message,
          });
        }

        const itemsQuery =
          "SELECT * FROM sales_items";

        db.query(
          itemsQuery,
          (err2, itemResults) => {

            if (err2) {
              return res.status(500).json({
                success: false,
                message: "DB Items Error",
                error: err2.message,
              });
            }

            const salesWithItems =
              salesResults.map((s) => ({
                ...s,
                items: itemResults.filter(
                  (i) =>
                    i.sales_id === s.id
                ),
              }));

            res.json({
              success: true,
              data: salesWithItems,
            });

          }
        );

      }
    );

  }
);

// ======================================================
// UPDATE STATUS
// ======================================================

router.put(
  "/update-status/:id",
  authenticateAndAuthorize(),
  async (req, res) => {

    const salesId = req.params.id;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: "Status is required",
      });
    }

    try {
      const currentSale = await query(`SELECT status, created_by FROM sales WHERE id = ?`, [salesId]);
      if (currentSale.length === 0) {
        return res.status(404).json({ success: false, message: "Sale not found" });
      }

      const currentStatus = currentSale[0].status;
      const targetStatus = status;

      const isOnline = currentSale[0].created_by?.includes("(Online)");

      const TRANSITIONS = {
        placed:     ['approved', 'cancelled'],
        approved:   ['packed', 'cancelled'],
        packed:     ['dispatched', 'cancelled'],
        dispatched: ['delivered'],
        delivered:  [],
        cancelled:  [],
        pending:    ['stock_out', 'completed'],
        stock_out:  ['completed', 'pending'],
        completed:  [],
      };

      if (!TRANSITIONS[currentStatus]?.includes(targetStatus) && targetStatus !== currentStatus) {
        return res.status(409).json({ success: false, message: `Illegal transition: ${currentStatus} -> ${targetStatus}` });
      }

      const deductedStatuses = ['packed', 'dispatched', 'delivered', 'stock_out', 'completed'];
      const isCurrentDeducted = deductedStatuses.includes(currentStatus);
      const isTargetDeducted = deductedStatuses.includes(targetStatus);

      const items = await query(`SELECT * FROM sales_items WHERE sales_id = ?`, [salesId]);

      // START TRANSACTION
      await query("START TRANSACTION");

      try {
        if (!isCurrentDeducted && isTargetDeducted) {
          // PENDING -> DEDUCTED
          const aggregatedQuantities = {};
          for (const item of items) {
            const q = parseInt(item.quantity, 10) || 0;
            aggregatedQuantities[item.product_code] = (aggregatedQuantities[item.product_code] || 0) + q;
          }

          for (const code in aggregatedQuantities) {
            const totalNeeded = aggregatedQuantities[code];
            const stockResult = await query(`SELECT quantity FROM product WHERE product_code = ? FOR UPDATE`, [code]);
            if (stockResult.length === 0 || stockResult[0].quantity < totalNeeded) {
              throw new Error(`Insufficient stock for ${code}`);
            }
          }

          for (const item of items) {
            await query(
              `UPDATE product SET quantity = quantity - ? WHERE product_code = ?`,
              [item.quantity, item.product_code]
            );
          }
        } else if (isCurrentDeducted && !isTargetDeducted) {
          // DEDUCTED -> NOT DEDUCTED
          for (const item of items) {
            await query(
              `UPDATE product SET quantity = quantity + ? WHERE product_code = ?`,
              [item.quantity, item.product_code]
            );
          }
        }

        // Update timestamps based on status
        let timeUpdateSql = "";
        if (targetStatus === 'dispatched') timeUpdateSql = ", dispatched_at = CURRENT_TIMESTAMP";
        else if (targetStatus === 'delivered') timeUpdateSql = ", delivered_at = CURRENT_TIMESTAMP";

        // Update status
        await query(
          `UPDATE sales SET status = ? ${timeUpdateSql} WHERE id = ?`,
          [targetStatus, salesId]
        );

        // Insert log
        await query(
          `INSERT INTO order_status_log (sales_id, from_status, to_status, actor_role, note) VALUES (?, ?, ?, ?, ?)`,
          [salesId, currentStatus, targetStatus, 'admin', 'Status updated by admin via dashboard']
        );

        // COMMIT TRANSACTION
        await query("COMMIT");

        res.json({
          success: true,
          message: "Status updated successfully",
        });
      } catch (txnErr) {
        await query("ROLLBACK");
        if (txnErr.message.includes("Insufficient stock")) {
          return res.status(400).json({ success: false, message: txnErr.message });
        }
        throw txnErr;
      }

    } catch (err) {

      console.error(
        "Status Update Error:",
        err
      );

      res.status(500).json({
        success: false,
        message: "Status Update Error",
        error: err.message,
      });

    }

  }
);

module.exports = router;