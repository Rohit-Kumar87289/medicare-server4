const express = require("express");
const morgan = require("morgan");
const userRoute = require("./Routes/userRoute");
const mongoose = require("mongoose");
const cookieParser = require('cookie-parser');
const fileuploader = require("express-fileupload");
const cors = require('cors'); 
const { Server } = require('socket.io'); // Destructured directly
const dotenv = require("dotenv");
dotenv.config();
// const dns = require("dns");
// dns.setServers(["1.1.1.1","8.8.8.8"]);
const nodemailer = require('nodemailer');
const axios = require('axios');
const cloudinary = require("cloudinary").v2;
const MessageColRef = require('./Model/Message'); // Adjust this path to where your model file is saved
cloudinary.config({
    cloud_name: process.env.cloud_name,
    api_key: process.env.api_key,
    api_secret: process.env.api_secret,
});

const app = express();
app.use(cookieParser());

// 1. Create HTTP server wrap around Express application instance
const http = require('http').createServer(app); 

// 2. Initialize Socket.IO on top of the HTTP server wrap
const io = new Server(http, {
    cors: {
        origin: 'http://localhost:5173',
        methods: ["GET", "POST"],
        credentials: true
    }
});

app.use(morgan("dev"));
app.use(fileuploader());
app.use(cors({
    origin: 'http://localhost:5173', // Your exact frontend URL
    credentials: true                // Allows the backend to accept cookies
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- SOCKET.IO EVENT ENGINE PIPELINE ---
io.on('connection', (socket) => {
    console.log(`📡 New Device Established Socket Connection: ${socket.id}`);

    // Listen for frontend joining a conversation room channel
    socket.on('join_room', async(roomId) => {
        socket.join(roomId);
        console.log(`🚪 User connected to secure room channel: ${roomId}`);

        try {
            // Fetch history for this specific room sorted from oldest to newest
            const history = await MessageColRef.find({ roomID: roomId }).sort({ createdAt: 1 });
            // Send history back ONLY to the single tab that just loaded
            socket.emit('load_history', history);
        } catch (err) {
            console.log("Error loading chat history:", err.message);
        }
    });

    // Listen for real-time chat transmissions coming from Navbars
    socket.on('send_message', async(data) => {
        try {
            // Build the new record using your exact schema keys
            const newMessage = new MessageColRef({
                roomID: data.roomID,
                medicineName: data.medicineName,
                city: data.city,
                needyEmail: data.needyEmail,
                donorEmail: data.donorEmail,
                senderEmail: data.senderEmail, // Who typed it
                text: data.text
            });

            // Save it safely to your MongoDB Atlas cluster
            const savedMessage = await newMessage.save();
            
            // --- FIXED FOR LIVE DASHBOARD SYNC ---
            // Use io.to() instead of socket.to() so that BOTH needy and donor 
            // dashboards get the saved message event instantly.
            io.to(data.roomID).emit('receive_message', savedMessage);
            
        } catch (err) {
            console.log("Error saving chat packet:", err.message);
        }
    });
      
    // 3. Tab Disconnecting / Closing
    socket.on('disconnecting', () => {
        const rooms = Array.from(socket.rooms);
        rooms.forEach((roomId) => {
            if (roomId !== socket.id) {
                const leaveNotification = {
                    roomID: roomId,
                    senderEmail: "system",
                    text: `❌ A user closed their tab or lost connection.`,
                };
                socket.to(roomId).emit('receive_message', leaveNotification);
            }
        });
    });

    socket.on('disconnect', () => {
        console.log(`❌ Device Severed Connection: ${socket.id}`);
    });
});
// Main App Routing Pipeline
app.use("/user", userRoute);

// Base routing check
app.get("/", (req, resp) => {
   resp.send("==+++++++++++> welcome -----+++++");
});

// Gemini endpoint config (Uncomment and replace with key if running '/generate')
// const apiKey = "AIzaSyB7qgsMaGSXsqDHCPjTnVzZ1YZwzDDTfXk";
// const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

app.post('/generate', async (req, resp) => {
    console.log("file aa rhi aa")
    console.log(req.files)
   
    const file = req.files.file;
    const base64 = file.data.toString('base64');
    const mimetype = file.mimetype;
    
    try {
        const geminiresp = await axios.post(endpoint, {
            contents: [
                {
                    parts: [
                        { text: "Describe this image:" },
                        {
                            inlineData: {
                                mimeType: mimetype,
                                data: base64
                            }
                        }
                    ]
                }
            ]
        }, {
            headers: { "Content-Type": "application/json" }
        });

        const resultText = geminiresp.data.candidates?.[0]?.content?.parts?.[0]?.text;
        resp.json({ response: resultText });
    } catch (err) {
        console.error(err.response?.data || err.message);
        resp.status(500).json({ msg: err.response?.data || err.message });
    }
});

const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI("AIzaSyB7qgsMaGSXsqDHCPjTnVzZ1YZwzDDTfXk");
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

async function RajeshBansalKaChirag(imgurl) {
    const myprompt = "Read the text on picture and tell all the information in adhaar card and give output STRICTLY in JSON format {adhaar_number:'', name:'', gender:'', dob: ''}. Dont give output as string."   
    const imageResp = await fetch(imgurl).then((response) => response.arrayBuffer());

    const result = await model.generateContent([
        {
            inlineData: {
                data: Buffer.from(imageResp).toString("base64"),
                mimeType: "image/jpeg",
            },
        },
        myprompt,
    ]);
    
    console.log(result.response.text());
            
    const cleaned = result.response.text().replace(/```json|```/g, '').trim();
    console.log(cleaned);
    const jsonData = JSON.parse(cleaned);
    console.log(jsonData);

    return jsonData;
}

app.post("/picreader", async function (req, resp) {
    console.log("pic reader")
    let fileName;
    if (req.files != null) {
        console.log("file yes")
        fileName = req.files.imggg.name;
        let locationToSave = __dirname + "/uploads/" + fileName;
        
        req.files.imggg.mv(locationToSave);
        
        try {
            await cloudinary.uploader.upload(locationToSave).then(async function (picUrlResult) {      
                console.log("file upload")
                console.log(picUrlResult.url);   

                let jsonData = await RajeshBansalKaChirag(picUrlResult.url);
                resp.send(jsonData);
            });
        } catch(err) {
            resp.send(err.message)
        }
    }
});

// Connect to MongoDB Database Atlas
let mongodbUrlAtlas = process.env.atlaurl;
mongoose.connect(mongodbUrlAtlas).then(() => {
    console.log("connected to Atlas Database");
}).catch((err) => {
    console.log("Database Error: ", err.message);
});

// CRITICAL INTEGRATION FIX: Start the unified 'http' wrapper instance on port 2005
http.listen(2005, "0.0.0.0", () => {
    console.log("==========================================================");
    console.log("🚀 HTTP SERVER & SOCKET.IO LIVE ON PORT: 2005 (site rohit) ");
    console.log("==========================================================");
});