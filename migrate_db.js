require('dotenv').config();
const db = require('./db');

const queries = [
  // 1. Create vehicles table
  `CREATE TABLE IF NOT EXISTS vehicles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    reg_number VARCHAR(20) NOT NULL UNIQUE,
    type VARCHAR(40),
    capacity_kg INT,
    is_active TINYINT(1) DEFAULT 1
  )`,
  
  // 2. Create drivers table
  `CREATE TABLE IF NOT EXISTS drivers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    phone VARCHAR(15) NOT NULL,
    license_no VARCHAR(40),
    is_active TINYINT(1) DEFAULT 1
  )`,

  // 3. Create shipments table
  `CREATE TABLE IF NOT EXISTS shipments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sales_id INT NOT NULL,
    vehicle_id INT NULL,
    driver_id INT NULL,
    lr_number VARCHAR(30) UNIQUE,
    eta DATETIME NULL,
    dispatched_at DATETIME NULL,
    FOREIGN KEY (sales_id) REFERENCES sales(id),
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id),
    FOREIGN KEY (driver_id) REFERENCES drivers(id)
  )`,

  // 4. Create order_status_log table
  `CREATE TABLE IF NOT EXISTS order_status_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sales_id INT NOT NULL,
    from_status VARCHAR(20),
    to_status VARCHAR(20) NOT NULL,
    actor_id INT,
    actor_role ENUM('admin','partner','driver','system'),
    note TEXT,
    ip_address VARCHAR(45),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_order (sales_id, created_at)
  )`,

  // 5. Create delivery_pod table
  `CREATE TABLE IF NOT EXISTS delivery_pod (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sales_id INT NOT NULL UNIQUE,
    otp_hash VARCHAR(255),
    otp_expires_at DATETIME,
    otp_attempts TINYINT DEFAULT 0,
    verified_at DATETIME NULL,
    signature_url VARCHAR(500),
    photo_url VARCHAR(500),
    received_by VARCHAR(120),
    locked TINYINT(1) DEFAULT 0,
    FOREIGN KEY (sales_id) REFERENCES sales(id)
  )`,

  // 6. Alter sales table columns (using safe checks if they already exist, but raw queries might fail if exist, so we will use try/catch in execution)
];

const alterQueries = [
  "ALTER TABLE sales ADD COLUMN sla_due_at DATETIME NULL;",
  "ALTER TABLE sales ADD COLUMN dispatched_at DATETIME NULL;",
  "ALTER TABLE sales ADD COLUMN delivered_at DATETIME NULL;",
];

const migrateStatuses = [
  "UPDATE sales SET status = 'placed' WHERE status = 'pending'",
  "UPDATE sales SET status = 'dispatched' WHERE status = 'stock_out'",
  "UPDATE sales SET status = 'delivered' WHERE status = 'completed'"
];

async function runQueries() {
  const queryAsync = (sql) => new Promise((resolve, reject) => {
    db.query(sql, (err, res) => {
      if (err) reject(err);
      else resolve(res);
    });
  });

  try {
    for (let i = 0; i < queries.length; i++) {
      console.log(`Executing table creation query ${i+1}...`);
      await queryAsync(queries[i]);
    }
    
    for (let i = 0; i < alterQueries.length; i++) {
      try {
        console.log(`Executing alter query ${i+1}...`);
        await queryAsync(alterQueries[i]);
      } catch (err) {
        if (err.code === 'ER_DUP_FIELDNAME') {
          console.log(`Column already exists, skipping...`);
        } else {
          throw err;
        }
      }
    }

    console.log("Migrating old status values...");
    for (const q of migrateStatuses) {
      await queryAsync(q);
    }

    console.log("Migration completed successfully.");
  } catch(e) {
    console.error("Migration error:", e);
  } finally {
    process.exit(0);
  }
}

runQueries();
