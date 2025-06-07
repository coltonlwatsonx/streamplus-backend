// A simple Node.js Express server to act as a secure backend for Stream+

const express = require("express");
const Mux = require("@mux/mux-node");
const cors = require("cors");
const admin = require("firebase-admin");

// --- IMPORTANT: LOAD ENVIRONMENT VARIABLES ---
const { 
    MUX_TOKEN_ID, 
    MUX_TOKEN_SECRET,
    MUX_WEBHOOK_SECRET,
    FIREBASE_SERVICE_ACCOUNT
} = process.env;

// --- INITIALIZE FIREBASE ADMIN ---
try {
    const serviceAccount = JSON.parse(FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    console.log("Firebase Admin initialized successfully.");
} catch(e) {
    console.error("Error initializing Firebase Admin. Make sure FIREBASE_SERVICE_ACCOUNT is set correctly.", e.message);
}
const db = admin.firestore();

// --- INITIALIZE MUX ---
const mux = new Mux(MUX_TOKEN_ID, MUX_TOKEN_SECRET);

// --- SETUP EXPRESS APP ---
const app = express();
// Special setup to get the raw request body, which Mux needs for webhook verification
app.use(express.json({
    verify: (req, res, buf) => {
        req.rawBody = buf;
    }
}));
app.use(cors());

// --- API ENDPOINTS ---

// This endpoint creates a new Mux Live Stream when the user clicks "Generate Key"
app.post("/create-live-stream", async (req, res) => {
    const { userId, appId } = req.body;
    if (!userId || !appId) {
        return res.status(400).json({ error: "User ID and App ID are required." });
    }

    try {
        const stream = await mux.video.liveStreams.create({
            playback_policy: ["public"],
            new_asset_settings: { playback_policy: ["public"] },
            reconnect_window: 10,
        });

        const docPath = `artifacts/${appId}/users/${userId}/status/live`;
        await db.doc(docPath).set({ streamId: stream.id, status: 'idle' });

        res.json({ streamKey: stream.stream_key });
    } catch (error) {
        console.error("Error creating Mux live stream:", error);
        res.status(500).json({ error: "Could not create live stream." });
    }
});

// This endpoint listens for status updates from Mux
app.post("/mux-webhook", async (req, res) => {
    const sig = req.headers["mux-signature"];
    try {
        Mux.Webhooks.verifyHeader(req.rawBody, sig, MUX_WEBHOOK_SECRET);
        const { type, data } = req.body;
        console.log(`Received Mux Webhook: ${type}`);

        const streamId = data.id;
        const statusCollection = db.collectionGroup('status');
        const query = statusCollection.where('streamId', '==', streamId).limit(1);
        const snapshot = await query.get();

        if (snapshot.empty) {
            console.log(`Webhook for unknown streamId: ${streamId}`);
            return res.status(200).send("No document for streamId.");
        }

        const docRef = snapshot.docs[0].ref;

        if (type === 'video.live_stream.active') {
            await docRef.update({ status: 'active' });
        } else if (type === 'video.live_stream.idle') {
            await docRef.update({ status: 'idle' });
        }
        res.status(200).send("Webhook received!");
    } catch (err) {
        console.error('Webhook signature verification failed.', err);
        res.status(400).send(`Webhook Error: ${err.message}`);
    }
});

// Start the server
const listener = app.listen(process.env.PORT || 3000, () => {
  console.log("Your app is listening on port " + listener.address().port);
});
