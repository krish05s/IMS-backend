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

    if (!htmlContent) {
      return res.status(400).json({ success: false, message: "Missing HTML content" });
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

    res.status(200).json({
      success: true,
      message: "PDF generated successfully!",
      cloudinary_url: documentUrl
    });

  } catch (error) {
    console.error("WhatsApp Send Error:", error);
    if (browser && typeof browser.close === 'function') await browser.close();
    
    res.status(500).json({
      success: false,
      message: "An error occurred while generating the bill.",
      error: error.message
    });
  }
});

module.exports = router;
