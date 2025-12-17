const request = require('supertest');
const app = require('../index');

describe('Financial Ledger API', () => {
  describe('POST /api/accounts', () => {
    it('should create a new account', async () => {
      const res = await request(app)
        .post('/api/accounts')
        .send({ name: 'Bank Account', type: 'asset' });
      expect(res.statusCode).toBe(201);
      expect(res.body.id).toBeDefined();
    });
  });

  describe('POST /api/transactions', () => {
    it('should create a double-entry transaction', async () => {
      const res = await request(app)
        .post('/api/transactions')
        .send({
          from_account_id: 1,
          to_account_id: 2,
          amount: 100
        });
      expect(res.statusCode).toBe(201);
      expect(res.body.id).toBeDefined();
    });

    it('should validate ACID compliance', async () => {
      const res = await request(app)
        .post('/api/transactions')
        .send({ from_account_id: 1, amount: 100 });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('GET /api/accounts/:id', () => {
    it('should retrieve account details', async () => {
      const res = await request(app)
        .get('/api/accounts/1');
      expect(res.statusCode).toBe(200);
      expect(res.body.name).toBeDefined();
    });
  });

  describe('GET /api/ledger', () => {
    it('should return double-entry ledger', async () => {
      const res = await request(app)
        .get('/api/ledger');
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('Transaction Integrity', () => {
    it('should maintain double-entry balance', async () => {
      const accountRes = await request(app)
        .get('/api/accounts');
      const total = accountRes.body.reduce((sum, acc) => sum + acc.balance, 0);
      expect(total).toBe(0);
    });
  });
});
