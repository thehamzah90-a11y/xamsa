const express = require('express');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const admin = require('firebase-admin');

const app = express();
// Render usually provides the PORT variable. Default to 3000 for local testing.
const PORT = process.env.PORT || 3000;
const SECRET_KEY = process.env.SECRET_KEY || 'SarifKeennaSecret786';

// --- FIREBASE INITIALIZATION ---
let db;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        db = admin.firestore();
        console.log("✅ Firebase Admin initialized successfully.");
    } catch (e) {
        console.error("❌ CRITICAL: Error parsing FIREBASE_SERVICE_ACCOUNT JSON:", e.message);
    }
} else {
    console.warn("⚠️ WARNING: FIREBASE_SERVICE_ACCOUNT environment variable not found. Firestore features will not work.");
}

app.use(cors());
app.use(bodyParser.json());

// --- MIDDLEWARE ---

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

const isAdmin = (req, res, next) => {
    if (req.user && req.user.phoneNumber === 'admin') {
        next();
    } else {
        res.status(403).json({ message: "Admin access required" });
    }
};

// --- API ENDPOINTS ---

// Login & User Auto-Creation
app.post('/api/login', async (req, res) => {
    const { phoneNumber, otp } = req.body;
    // Simple logic: admin/admin for control panel, or any phone with 1234
    const isUser = phoneNumber && otp === '1234';
    const isRootAdmin = phoneNumber === 'admin' && otp === 'admin';

    if (isUser || isRootAdmin) {
        try {
            if (db) {
                const userRef = db.collection('users').doc(phoneNumber);
                const doc = await userRef.get();
                if (!doc.exists) {
                    await userRef.set({
                        balance: 0.0,
                        phoneNumber: phoneNumber,
                        createdAt: new Date().toISOString()
                    });
                }
            }

            const token = jwt.sign({ phoneNumber }, SECRET_KEY, { expiresIn: '24h' });
            res.json({ token });
        } catch (e) {
            console.error("Login DB Error:", e.message);
            res.status(500).json({ message: 'Database error', error: e.message });
        }
    } else {
        res.status(400).json({ message: 'Invalid phone or OTP' });
    }
});

// Get User Balance
app.get('/api/balance', authenticateToken, async (req, res) => {
    try {
        if (!db) return res.status(500).json({ message: "Database not connected" });
        const userDoc = await db.collection('users').doc(req.user.phoneNumber).get();
        res.json({ balance: userDoc.data()?.balance || 0.0 });
    } catch (e) {
        res.status(500).json({ message: 'Error fetching balance' });
    }
});

// Get User's Own Transactions
app.get('/api/transactions', authenticateToken, async (req, res) => {
    try {
        if (!db) return res.status(500).json({ message: "Database not connected" });
        const snapshot = await db.collection('transactions')
            .where('userId', '==', req.user.phoneNumber)
            .orderBy('date', 'desc')
            .limit(50)
            .get();
        const transactions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json(transactions);
    } catch (e) {
        res.status(500).json({ message: 'Error fetching transactions' });
    }
});

// Universal Transaction Request (Used by all 4 app buttons)
app.post('/api/transaction/request', authenticateToken, async (req, res) => {
    const { type, amount, details } = req.body;
    const numAmount = parseFloat(amount);

    if (isNaN(numAmount) || numAmount <= 0) {
        return res.status(400).json({ message: 'Invalid amount provided' });
    }

    try {
        if (!db) return res.status(500).json({ message: "Database not connected" });

        const newTx = {
            userId: req.user.phoneNumber,
            type: type, // "Kasoo Dir Zaad", "Ku Shubo 1xBet", "Kala Soo Bax 1xBet", "Ku Dirso Zaadkaaga"
            amount: numAmount,
            details: details || {},
            date: new Date().toISOString(),
            status: 'PENDING'
        };

        const docRef = await db.collection('transactions').add(newTx);
        res.json({ message: 'Request submitted successfully', id: docRef.id });
    } catch (e) {
        res.status(500).json({ message: 'Error submitting request' });
    }
});

// --- ADMIN ENDPOINTS ---

// Get All Transactions for Management
app.get('/api/admin/transactions', authenticateToken, isAdmin, async (req, res) => {
    try {
        if (!db) return res.status(500).json({ message: "Database not connected" });
        const snapshot = await db.collection('transactions').orderBy('date', 'desc').limit(100).get();
        const transactions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json(transactions);
    } catch (e) {
        res.status(500).json({ message: 'Error fetching admin transactions' });
    }
});

// Approve or Reject a Transaction
app.post('/api/admin/transaction/status', authenticateToken, isAdmin, async (req, res) => {
    const { transactionId, status } = req.body; // status: "APPROVED" or "REJECTED"

    try {
        if (!db) return res.status(500).json({ message: "Database not connected" });
        const txRef = db.collection('transactions').doc(transactionId);
        const txDoc = await txRef.get();

        if (!txDoc.exists) return res.status(404).json({ message: 'Transaction not found' });
        if (txDoc.data().status !== 'PENDING') return res.status(400).json({ message: 'Transaction already processed' });

        const txData = txDoc.data();
        const userRef = db.collection('users').doc(txData.userId);

        await db.runTransaction(async (t) => {
            if (status === 'APPROVED') {
                const userDoc = await t.get(userRef);
                let currentBalance = userDoc.data().balance || 0;

                // INTAKE (Increases user wallet): "Kasoo Dir Zaad" or "Kala Soo Bax 1xBet"
                if (txData.type === "Kasoo Dir Zaad" || txData.type === "Kala Soo Bax 1xBet") {
                    t.update(userRef, { balance: currentBalance + txData.amount });
                }
                // OUTTAKE (Decreases user wallet): "Ku Shubo 1xBet" or "Ku Dirso Zaadkaaga"
                else if (txData.type === "Ku Shubo 1xBet" || txData.type === "Ku Dirso Zaadkaaga") {
                    if (currentBalance < txData.amount) throw new Error("Insufficient user balance");
                    t.update(userRef, { balance: currentBalance - txData.amount });
                }
            }
            t.update(txRef, { status: status, processedAt: new Date().toISOString() });
        });

        res.json({ message: `Transaction has been ${status.toLowerCase()}` });
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
});

// App Config Management
app.get('/api/config', async (req, res) => {
    try {
        if (!db) return res.json({ whatsapp: "+252...", instructions: "Please follow steps..." });
        const configDoc = await db.collection('config').doc('app').get();
        res.json(configDoc.data() || { whatsapp: "+252...", instructions: "Follow the steps on screen." });
    } catch (e) {
        res.status(500).json({ message: 'Error fetching config' });
    }
});

app.post('/api/admin/config', authenticateToken, isAdmin, async (req, res) => {
    try {
        if (!db) return res.status(500).json({ message: "Database not connected" });
        await db.collection('config').doc('app').set(req.body, { merge: true });
        res.json({ message: 'App configuration updated successfully' });
    } catch (e) {
        res.status(500).json({ message: 'Error updating config' });
    }
});

// --- SERVER START ---
// Note: listening on '0.0.0.0' is required for Render
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Sarifkeenna Backend is live on port ${PORT}`);
    console.log(`📡 URL: http://0.0.0.0:${PORT}`);
});
