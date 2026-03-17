const express = require('express');
const cors = require('cors');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const app = express();
app.use(cors());
app.use(express.json());

const ACCOUNT_URL = process.env.ACCOUNT_SERVICE_URL || 'http://localhost:8080';

app.post('/buy', async (req, res) => {
  try {
    const { id, amount } = req.body;
    const response = await fetch(ACCOUNT_URL + '/Account/Cryptos/Add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: id, amount: amount })
    });
    const result = await response.json();
    res.json(result);
  } catch(e) { res.json(false); }
});

app.post('/sell', async (req, res) => {
  try {
    const { id, amount } = req.body;
    const response = await fetch(ACCOUNT_URL + '/Account/Cryptos/Remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: id, amount: amount })
    });
    const result = await response.json();
    res.json(result);
  } catch(e) { res.json(false); }
});

app.listen(8002, () => console.log('BuySell running on port 8002'));
