const mongoose = require("mongoose");

const MessageSchema = new mongoose.Schema({
  roomID: { type: String, required: true },       // e.g., "painkiller_delhi_needy_donor"
  needyEmail: { type: String, required: true },
  donorEmail: { type: String, required: true },
  senderEmail: { type: String, required: true },  // Who actually typed this message
  text: { type: String, required: true },
  seen: { type: Boolean, default: false }         // 🔥 Added to track unread message notifications
}, { 
  timestamps: true, // Automatically manages createdAt and updatedAt fields
  versionKey: false // Turns off the default '__v' tracking field completely
});

// Create the model collection named "MessageCollection" using your MessageSchema
const MessageColRef = mongoose.model("MessageCollection", MessageSchema); 

module.exports = MessageColRef;