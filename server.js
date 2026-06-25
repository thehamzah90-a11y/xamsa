const express = require('express');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const admin = require('firebase-admin');

const app = express();
const PORT = process.env.PORT || 10000;
const SECRET_KEY = process.env.SECRET_KEY || 'SarifKeennaSecret786';

// --- DATABASE CONNECTION (FIREBASE) ---
let db = null;
try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        db = admin.firestore();
        console.log("✅ Database Connected: Sarifkeenna is ready!");
    } else {
        console.log("⚠️ Database not connected yet. Please add FIREBASE_SERVICE_ACCOUNT in Render Environment.");
    }
} catch (error) {
    console.error("❌ Database Connection Error:", error.message);
}

app.use(cors());
app.use(bodyParser.json());

// --- APP LOGIC ---

// 1. Home Check (Heartbeat)
app.get('/', (req, res) => {
    res.send("<h1>Sarifkeenna Backend is LIVE! 🚀</h1><p>Ready for transactions.</p>");
});

// 2. Auth Middleware
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
    if (req.user && req.user.phoneNumber === 'admin') next();
    else res.status(403).json({ message: "Admin access denied" });
};

// 3. Login
app.post('/api/login', async (req, res) => {
    const { phoneNumber, otp } = req.body;
    const isUser = phoneNumber && otp === '1234';
    const isRootAdmin = phoneNumber === 'admin' && otp === 'admin';

    if (isUser || isRootAdmin) {
        try {
            if (db) {
                const userRef = db.collection('users').doc(phoneNumber);
                const doc = await userRef.get();
                if (!doc.exists) {
                    await userRef.set({ balance: 0.0, phoneNumber: phoneNumber, createdAt: new Date().toISOString() });
                }
            }
            const token = jwt.sign({ phoneNumber }, SECRET_KEY, { expiresIn: '24h' });
            res.json({ token });
        } catch (e) {
            res.status(500).json({ message: 'Login error', error: e.message });
        }
    } else {
        res.status(400).json({ message: 'Invalid phone or OTP' });
    }
});

// 4. User Features
app.get('/api/balance', authenticateToken, async (req, res) => {
    try {
        if (!db) return res.json({ balance: 0.0 });
        const userDoc = await db.collection('users').doc(req.user.phoneNumber).get();
        res.json({ balance: userDoc.data()?.balance || 0.0 });
    } catch (e) { res.status(500).send("Error"); }
});

app.get('/api/transactions', authenticateToken, async (req, res) => {
    try {
        if (!db) return res.json([]);
        const snapshot = await db.collection('transactions').where('userId', '==', req.user.phoneNumber).orderBy('date', 'desc').get();
        res.json(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    } catch (e) { res.json([]); }
});

app.post('/api/transaction/request', authenticateToken, async (req, res) => {
    const { type, amount, details } = req.body;
    try {
        if (!db) return res.status(500).json({ message: "DB not ready" });
        const newTx = {
            userId: req.user.phoneNumber,
            type, amount: parseFloat(amount), details: details || {},
            date: new Date().toISOString(), status: 'PENDING'
        };
        const docRef = await db.collection('transactions').add(newTx);
        res.json({ message: 'Submitted', id: docRef.id });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

// 5. Admin Features
app.get('/api/admin/transactions', authenticateToken, isAdmin, async (req, res) => {
    try {
        if (!db) return res.json([]);
        const snapshot = await db.collection('transactions').orderBy('date', 'desc').get();
        res.json(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    } catch (e) { res.json([]); }
});

app.post('/api/admin/transaction/status', authenticateToken, isAdmin, async (req, res) => {
    const { transactionId, status } = req.body;
    try {
        if (!db) return res.status(500).send("DB offline");
        const txRef = db.collection('transactions').doc(transactionId);
        const txDoc = await txRef.get();
        const txData = txDoc.data();
        const userRef = db.collection('users').doc(txData.userId);

        await db.runTransaction(async (t) => {
            if (status === 'APPROVED') {
                const userDoc = await t.get(userRef);
                const currentBalance = userDoc.data().balance || 0;
                if (txData.type === "Kasoo Dir Zaad" || txData.type === "Kala Soo Bax 1xBet") {
                    t.update(userRef, { balance: currentBalance + txData.amount });
                } else {
                    t.update(userRef, { balance: currentBalance - txData.amount });
                }
            }
            t.update(txRef, { status: status });
        });
        res.json({ message: status });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

// 6. Config Features (WhatsApp & Instructions)
app.get('/api/config', async (req, res) => {
    try {
        if (!db) return res.json({ whatsapp: "+252...", instructions: "Instructions here." });
        const doc = await db.collection('config').doc('app').get();
        res.json(doc.data() || { whatsapp: "+252...", instructions: "Instructions here." });
    } catch (e) { res.json({ whatsapp: "+252...", instructions: "Error" }); }
});

app.post('/api/admin/config', authenticateToken, isAdmin, async (req, res) => {
    try {
        if (!db) return res.status(500).send("DB offline");
        await db.collection('config').doc('app').set(req.body, { merge: true });
        res.json({ message: 'Updated' });
    } catch (e) { res.status(500).send("Error"); }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Sarifkeenna Backend live on port ${PORT}`);
});
