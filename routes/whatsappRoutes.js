const express = require("express");
const router = express.Router();
const puppeteer = require("puppeteer");
const axios = require("axios");
const cloudinary = require("cloudinary").v2;
const { Readable } = require("stream");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

router.post("/send-bill", async (req, res) => {
  let browser;
  try {
    const { phone, htmlContent, fileName, message } = req.body;

    if (!phone || !htmlContent) {
      return res.status(400).json({ success: false, message: "Missing phone or HTML content" });
    }

    // 1. Generate PDF in memory
    browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: "networkidle2", timeout: 60000 });
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "20px", bottom: "20px", left: "20px", right: "20px" },
    });
    await browser.close();

    // 2. Upload to Cloudinary securely in 'bills' folder
    const uploadToCloudinary = (buffer, filename) => {
      return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            resource_type: "raw", // 'raw' is for non-image/video files like PDF
            folder: "bills",
            public_id: `${filename}_${Date.now()}.pdf`,
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );
        const readableStream = new Readable();
        readableStream._read = () => { };
        readableStream.push(buffer);
        readableStream.push(null);
        readableStream.pipe(stream);
      });
    };

    const uploadResult = await uploadToCloudinary(pdfBuffer, fileName || "Invoice");
    const documentUrl = uploadResult.secure_url;

    // 3. Send WhatsApp via Meta Cloud API
    const whatsappToken = process.env.WHATSAPP_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (!whatsappToken || !phoneNumberId) {
      return res.status(500).json({ success: false, message: "WhatsApp API credentials missing in backend." });
    }

    const payload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: phone,
      type: "document",
      document: {
        link: documentUrl,
        caption: message || "Here is your requested document.",
        filename: `${fileName || "Invoice"}.pdf`
      }
    };

    console.log("Sending WhatsApp payload:", JSON.stringify(payload, null, 2));

    const whatsappResponse = await axios.post(
      `https://graph.facebook.com/v17.0/${phoneNumberId}/messages`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${whatsappToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    res.status(200).json({
      success: true,
      message: "WhatsApp sent successfully!",
      cloudinary_url: documentUrl,
      whatsapp_response: whatsappResponse.data
    });

  } catch (error) {
    console.error("WhatsApp Send Error:", error.response?.data || error);
    if (browser && typeof browser.close === 'function') await browser.close();

    // Extract Meta API error message if available
    let customMessage = "An error occurred while generating or sending the bill.";
    if (error.response?.data?.error?.message) {
      customMessage = error.response.data.error.message;
    }

    res.status(500).json({
      success: false,
      message: customMessage,
      error: error.message
    });
  }
});

// --- META WEBHOOK VERIFICATION (GET) ---
// Meta will call this URL to verify the webhook setup
router.get("/webhook", (req, res) => {
  const VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN;

  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token) {
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("WEBHOOK_VERIFIED");
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  } else {
    res.status(400).send("Missing parameters");
  }
});

// --- META WEBHOOK NOTIFICATIONS (POST) ---
// Meta will send delivery statuses and incoming messages here
router.post("/webhook", (req, res) => {
  const body = req.body;
  if (body.object) {
    console.log("Incoming Webhook Event:", JSON.stringify(body, null, 2));
    res.sendStatus(200);
  } else {
    res.sendStatus(404);
  }
});

module.exports = router;
