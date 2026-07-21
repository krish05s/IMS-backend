const express = require("express");
const router = express.Router();
const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode');
const pino = require('pino');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');

// State
let qrCodeData = "";
let isReady = false;
let isAuthenticating = false;
let sock = null;

const authPath = path.join(__dirname, '..', '.auth_info_baileys');

const initializeWhatsApp = async () => {
    try {
        const { state, saveCreds } = await useMultiFileAuthState(authPath);

        sock = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            logger: pino({ level: 'silent' }),
            browser: ['Micara IMS', 'Chrome', '1.0.0']
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                isAuthenticating = false;
                qrCodeData = await qrcode.toDataURL(qr);
                console.log('QR Code generated! Ready to scan on frontend.');
            }

            if (connection === 'connecting') {
                isAuthenticating = true;
            }

            if (connection === 'open') {
                console.log('WhatsApp Client is ready!');
                isReady = true;
                isAuthenticating = false;
                qrCodeData = "";
            }

            if (connection === 'close') {
                const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
                console.log('WhatsApp connection closed due to ', lastDisconnect?.error, ', reconnecting ', shouldReconnect);
                
                isReady = false;
                isAuthenticating = false;
                qrCodeData = "";

                if (shouldReconnect) {
                    setTimeout(() => initializeWhatsApp(), 2000);
                } else {
                    console.log('Logged out from WhatsApp. Wiping session...');
                    if (fs.existsSync(authPath)) {
                        fs.rmSync(authPath, { recursive: true, force: true });
                    }
                    setTimeout(() => initializeWhatsApp(), 2000);
                }
            }
        });

    } catch (err) {
        console.error("Failed to initialize WhatsApp client:", err);
    }
};

initializeWhatsApp();

router.get("/status", (req, res) => {
    res.json({
        success: true,
        isReady,
        isAuthenticating,
        qrCode: isReady ? null : qrCodeData
    });
});

router.post("/logout", async (req, res) => {
  try {
    if (sock && isReady) {
      await sock.logout();
      isReady = false;
      qrCodeData = "";
      res.status(200).json({ success: true, message: "Successfully logged out from WhatsApp." });
    } else {
      res.status(400).json({ success: false, message: "Client is not connected." });
    }
  } catch (error) {
    console.error("WhatsApp Logout Error:", error);
    res.status(500).json({ success: false, message: "Failed to logout.", error: error.message });
  }
});

router.post("/send-bill", async (req, res) => {
  try {
    const { phone, fileName, message, pdfBase64 } = req.body;

    if (!pdfBase64) {
      return res.status(400).json({ success: false, message: "Missing PDF base64 data" });
    }

    if (!phone) {
        return res.status(400).json({ success: false, message: "Phone number is required." });
    }

    if (!isReady) {
        return res.status(403).json({ success: false, message: "WhatsApp client is not connected. Please scan the QR code first." });
    }

    // Format phone number for Baileys
    const formattedPhone = phone.replace(/\D/g, ''); // Remove non-digits
    const jid = `${formattedPhone}@s.whatsapp.net`;

    const pdfBuffer = Buffer.from(pdfBase64, 'base64');
    
    await sock.sendMessage(jid, {
        document: pdfBuffer,
        mimetype: 'application/pdf',
        fileName: `${fileName}.pdf`,
        caption: message
    });

    res.status(200).json({
      success: true,
      message: "PDF sent successfully via WhatsApp!"
    });

  } catch (error) {
    console.error("WhatsApp Send Error:", error);
    res.status(500).json({
      success: false,
      message: "An error occurred while sending the bill.",
      error: error.message
    });
  }
});

module.exports = router;
