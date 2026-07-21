const express = require("express");
const router = express.Router();
const puppeteer = require("puppeteer");
const axios = require("axios");
const cloudinary = require("cloudinary").v2;
const { Readable } = require("stream");
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const fs = require('fs');
const path = require('path');

// WhatsApp Client State
let qrCodeData = "";
let isReady = false;
let isAuthenticating = false;
let client = null;

const initializeWhatsApp = async () => {
    try {
        if (client) {
            try { await client.destroy(); } catch (e) {}
        }

        const executablePath = await puppeteer.executablePath();
        client = new Client({
            authStrategy: new LocalAuth(),
            webVersionCache: {
                type: 'remote',
                remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
            },
            puppeteer: { 
                headless: true, 
                executablePath: executablePath,
                args: [
                    '--no-sandbox', 
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-features=IsolateOrigins,site-per-process',
                    '--disable-site-isolation-trials'
                ],
                timeout: 60000
            }
        });

        client.on('qr', async (qr) => {
            try {
                isAuthenticating = false;
                qrCodeData = await qrcode.toDataURL(qr);
                console.log('QR Code generated! Ready to scan on frontend.');
            } catch(err) {
                console.error("QR Code Error:", err);
            }
        });

        client.on('authenticated', () => {
            console.log('WhatsApp Authenticated! Loading chats...');
            isAuthenticating = true;
        });

        client.on('ready', () => {
            isReady = true;
            isAuthenticating = false;
            qrCodeData = "";
            console.log('WhatsApp Client is ready!');
        });

        client.on('disconnected', async (reason) => {
            console.log('WhatsApp Client disconnected:', reason);
            isReady = false;
            isAuthenticating = false;
            qrCodeData = "";
            
            try { await client.destroy(); } catch (e) {}
            
            // Delete the auth folder to ensure a clean start after logout
            if (reason === 'LOGOUT') {
                const authPath = path.join(__dirname, '..', '.wwebjs_auth');
                if (fs.existsSync(authPath)) {
                    fs.rmSync(authPath, { recursive: true, force: true });
                }
            }
            
            setTimeout(() => {
                initializeWhatsApp();
            }, 3000);
        });

        await client.initialize();
    } catch(err) {
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

router.post("/send-bill", async (req, res) => {
  let browser;
  try {
    const { phone, htmlContent, fileName, message, returnBase64 } = req.body;

    if (!htmlContent) {
      return res.status(400).json({ success: false, message: "Missing HTML content" });
    }

    if (!returnBase64 && !phone) {
        return res.status(400).json({ success: false, message: "Phone number is required for direct sending." });
    }

    // 1. Generate PDF in memory
    browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();
    // Use 'load' instead of 'networkidle2' to prevent timeouts from external resources
    await page.setContent(htmlContent, { waitUntil: "load", timeout: 60000 });
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "20px", bottom: "20px", left: "20px", right: "20px" },
    });
    await browser.close();
    
    // Puppeteer returns a Uint8Array, so convert to Buffer to safely encode to base64
    const pdfBase64 = Buffer.from(pdfBuffer).toString('base64');

    if (returnBase64) {
      return res.status(200).json({
        success: true,
        message: "PDF generated successfully!",
        pdf_base64: pdfBase64
      });
    }

    // Direct Sending via whatsapp-web.js
    if (!isReady) {
        return res.status(403).json({ success: false, message: "WhatsApp client is not connected. Please scan the QR code first." });
    }

    // Format phone number
    const formattedPhone = phone.replace(/\D/g, ''); // Remove non-digits
    const chatId = `${formattedPhone}@c.us`;

    const media = new MessageMedia('application/pdf', pdfBase64, `${fileName}.pdf`);
    
    // Send message and attachment
    await client.sendMessage(chatId, media, { caption: message });

    res.status(200).json({
      success: true,
      message: "PDF sent successfully via WhatsApp!"
    });

  } catch (error) {
    console.error("WhatsApp Send Error:", error);
    if (browser && typeof browser.close === 'function') await browser.close();
    
    res.status(500).json({
      success: false,
      message: "An error occurred while sending the bill.",
      error: error.message
    });
  }
});

router.post("/logout", async (req, res) => {
  try {
    if (client && isReady) {
      await client.logout();
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

module.exports = router;
