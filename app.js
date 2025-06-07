// A simple Node.js Express server to act as a secure backend for Stream+

const express = require("express");
const Mux = require("@mux/mux-node");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors()); // Allow our frontend to talk to this backend

// IMPORTANT: Your Mux credentials from Render's Environment Variables
const { MUX_TOKEN_ID, MUX_TOKEN_SECRET } = process.env;

// Check if Mux credentials are set
if (!MUX_TOKEN_ID || !MUX_TOKEN_SECRET) {
  console.error("Mux API credentials are not set in the environment!");
} else {
  console.log("Mux credentials loaded successfully.");
}

// Initialize the Mux client
const { Video } = new Mux(MUX_TOKEN_ID, MUX_TOKEN_SECRET);

// This endpoint creates a new Mux Live Stream
app.post("/create-live-stream", async (req, res) => {
  try {
    const stream = await Video.LiveStreams.create({
      playback_policy: ["public"],
      new_asset_settings: { playback_policy: ["public"] },
      reconnect_window: 10,
    });

    console.log("Successfully created a Mux Live Stream.");

    // Send the necessary details back to the Stream+ frontend
    res.json({
      streamKey: stream.stream_key,
      playbackId: stream.playback_ids[0].id,
    });

  } catch (error) {
    console.error("Error creating Mux live stream:", error);
    res.status(500).json({ error: "Could not create live stream." });
  }
});

// A simple endpoint to check if the server is running
app.get("/", (req, res) => {
  res.send("Stream+ Backend is running!");
});

// Start the server
const listener = app.listen(process.env.PORT || 3000, () => {
  console.log("Your app is listening on port " + listener.address().port);
});
