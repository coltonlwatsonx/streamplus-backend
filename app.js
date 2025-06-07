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
// This allows the server to securely write to your database.
try {
    const serviceAccount = JSON.parse(FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    console.log("Firebase Admin initialized successfully.");
} catch(e) {
    console.error("Error initializing Firebase Admin. Make sure FIREBASE_SERVICE_ACCOUNT is set correctly.", e);
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
    try {
        const stream = await mux.video.liveStreams.create({
            playback_policy: ["public"],
            new_asset_settings: { playback_policy: ["public"] },
            reconnect_window: 10,
        });
        await db.collection("status").doc("live").set({ streamId: stream.id, status: 'idle' });
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
        // Verify the request came from Mux
        Mux.Webhooks.verifyHeader(req.rawBody, sig, MUX_WEBHOOK_SECRET);

        const { type, data } = req.body;
        console.log(`Received Mux Webhook: ${type}`);

        if (type === 'video.live_stream.active') {
            await db.collection("status").doc("live").set({ status: 'active', streamId: data.id });
        } else if (type === 'video.live_stream.idle') {
            await db.collection("status").doc("live").set({ status: 'idle', streamId: data.id });
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
