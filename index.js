const express = require('express');
const { Pool } = require('pg');
const Decimal = require('decimal.js');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());

// PostgreSQL connection pool
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'financial_ledger'
});

// Initialize database tables
async function initializeDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS accounts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR(50) NOT NULL,
        account_type VARCHAR(20) NOT NULL,
        currency VARCHAR(3) NOT NULL DEFAULT 'USD',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS ledger_entries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        account_id UUID NOT NULL REFERENCES accounts(id),
        transaction_id UUID NOT NULL,
        entry_type VARCHAR(10) NOT NULL,
        amount NUMERIC(19,4) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT check_positive_amount CHECK (amount > 0)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        type VARCHAR(20) NOT NULL,
        source_account_id UUID,
        destination_account_id UUID,
        amount NUMERIC(19,4) NOT NULL,
        status VARCHAR(20) DEFAULT 'PENDING',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Database initialization error:', error);
  }
}

// POST /accounts - Create account
app.post('/accounts', async (req, res) => {
  const { userId, accountType, currency } = req.body;
  if (!userId || !accountType) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const accountId = uuidv4();
    await pool.query(
      'INSERT INTO accounts (id, user_id, account_type, currency) VALUES ($1, $2, $3, $4)',
      [accountId, userId, accountType, currency || 'USD']
    );
    res.status(201).json({ id: accountId, userId, accountType, currency: currency || 'USD' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /accounts/{accountId} - Get account with balance
app.get('/accounts/:accountId', async (req, res) => {
  const { accountId } = req.params;
  try {
    const accountRes = await pool.query(
      'SELECT * FROM accounts WHERE id = $1',
      [accountId]
    );
    if (accountRes.rows.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const account = accountRes.rows[0];
    const balanceRes = await pool.query(
      `SELECT COALESCE(SUM(CASE WHEN entry_type='CREDIT' THEN amount ELSE -amount END), 0) as balance
       FROM ledger_entries WHERE account_id = $1`,
      [accountId]
    );
    const balance = balanceRes.rows[0].balance;

    res.json({
      id: account.id,
      userId: account.user_id,
      accountType: account.account_type,
      currency: account.currency,
      balance: new Decimal(balance).toString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /accounts/{accountId}/ledger - Get ledger entries
app.get('/accounts/:accountId/ledger', async (req, res) => {
  const { accountId } = req.params;
  try {
    const result = await pool.query(
      `SELECT id, transaction_id, entry_type, amount, created_at 
       FROM ledger_entries 
       WHERE account_id = $1 
       ORDER BY created_at ASC`,
      [accountId]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /transfers - Execute transfer
app.post('/transfers', async (req, res) => {
  const { sourceAccountId, destinationAccountId, amount } = req.body;
  if (!sourceAccountId || !destinationAccountId || !amount) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const client = await pool.connect();
  try {
    const transactionId = uuidv4();
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');

    // Check source balance
    const sourceBalance = await client.query(
      `SELECT COALESCE(SUM(CASE WHEN entry_type='CREDIT' THEN amount ELSE -amount END), 0) as balance
       FROM ledger_entries WHERE account_id = $1`,
      [sourceAccountId]
    );
    const balance = new Decimal(sourceBalance.rows[0].balance);
    const transferAmount = new Decimal(amount);

    if (balance.lessThan(transferAmount)) {
      await client.query('ROLLBACK');
      return res.status(422).json({ error: 'Insufficient funds' });
    }

    // Create debit entry
    await client.query(
      `INSERT INTO ledger_entries (id, account_id, transaction_id, entry_type, amount)
       VALUES ($1, $2, $3, 'DEBIT', $4)`,
      [uuidv4(), sourceAccountId, transactionId, amount]
    );

    // Create credit entry
    await client.query(
      `INSERT INTO ledger_entries (id, account_id, transaction_id, entry_type, amount)
       VALUES ($1, $2, $3, 'CREDIT', $4)`,
      [uuidv4(), destinationAccountId, transactionId, amount]
    );

    // Update transaction status
    await client.query(
      `INSERT INTO transactions (id, type, source_account_id, destination_account_id, amount, status)
       VALUES ($1, 'TRANSFER', $2, $3, $4, 'COMPLETED')`,
      [transactionId, sourceAccountId, destinationAccountId, amount]
    );

    await client.query('COMMIT');
    res.status(201).json({ id: transactionId, status: 'COMPLETED' });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// POST /deposits - Simulate deposit
app.post('/deposits', async (req, res) => {
  const { accountId, amount } = req.body;
  if (!accountId || !amount) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const client = await pool.connect();
  try {
    const transactionId = uuidv4();
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');

    await client.query(
      `INSERT INTO ledger_entries (id, account_id, transaction_id, entry_type, amount)
       VALUES ($1, $2, $3, 'CREDIT', $4)`,
      [uuidv4(), accountId, transactionId, amount]
    );

    await client.query(
      `INSERT INTO transactions (id, type, destination_account_id, amount, status)
       VALUES ($1, 'DEPOSIT', $2, $3, 'COMPLETED')`,
      [transactionId, accountId, amount]
    );

    await client.query('COMMIT');
    res.status(201).json({ id: transactionId, status: 'COMPLETED' });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// POST /withdrawals - Simulate withdrawal
app.post('/withdrawals', async (req, res) => {
  const { accountId, amount } = req.body;
  if (!accountId || !amount) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const client = await pool.connect();
  try {
    const transactionId = uuidv4();
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');

    // Check balance
    const balanceRes = await client.query(
      `SELECT COALESCE(SUM(CASE WHEN entry_type='CREDIT' THEN amount ELSE -amount END), 0) as balance
       FROM ledger_entries WHERE account_id = $1`,
      [accountId]
    );
    const balance = new Decimal(balanceRes.rows[0].balance);
    const withdrawAmount = new Decimal(amount);

    if (balance.lessThan(withdrawAmount)) {
      await client.query('ROLLBACK');
      return res.status(422).json({ error: 'Insufficient funds' });
    }

    await client.query(
      `INSERT INTO ledger_entries (id, account_id, transaction_id, entry_type, amount)
       VALUES ($1, $2, $3, 'DEBIT', $4)`,
      [uuidv4(), accountId, transactionId, amount]
    );

    await client.query(
      `INSERT INTO transactions (id, type, source_account_id, amount, status)
       VALUES ($1, 'WITHDRAWAL', $2, $3, 'COMPLETED')`,
      [transactionId, accountId, amount]
    );

    await client.query('COMMIT');
    res.status(201).json({ id: transactionId, status: 'COMPLETED' });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

const PORT = process.env.PORT || 3000;

initializeDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`Financial Ledger API running on port ${PORT}`);
  });
});

module.exports = app;
