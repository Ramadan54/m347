const express = require('express');
const cors = require('cors');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const app = express();
app.use(cors());
app.use(express.json());

const ACCOUNT_URL = process.env.ACCOUNT_SERVICE_URL || 'http://localhost:8080';

app.post('/send', async (req, res) => {
  try {
    const { id, receiverId, amount } = req.body;
    const response = await fetch(ACCOUNT_URL + '/Account/Cryptos/Send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: id, receiverId: receiverId, amount: amount })
    });
    const result = await response.json();
    res.json(result);
  } catch(e) { res.json(false); }
});

app.listen(8003, () => console.log('SendReceive running on port 8003'));
