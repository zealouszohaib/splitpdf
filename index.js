
// const Anthropic = require('@anthropic-ai/sdk');
// const { toFile } = require('@anthropic-ai/sdk');

import { Anthropic, toFile } from "@anthropic-ai/sdk";
import fs from "fs";
import dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

// Get API key from environment variable
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// Validate API key
if (!ANTHROPIC_API_KEY || ANTHROPIC_API_KEY.length === 0) {
  console.error("❌ Error: ANTHROPIC_API_KEY is not set. Please set it as an environment variable or check your configuration.");
  process.exit(1);
}

console.log("🔑 Using API key:", ANTHROPIC_API_KEY.substring(0, 20) + "...");

const anthropic = new Anthropic({
  apiKey: ANTHROPIC_API_KEY
});

const pageFiles = ['fifty.pdf', 'hundred.pdf', 'oneFifty.pdf', 'end.pdf'];

console.log("📁 Checking files...");
const missingFiles = pageFiles.filter(file => !fs.existsSync(file));
if (missingFiles.length > 0) {
  console.error("❌ Missing files:", missingFiles);
  process.exit(1);
}
console.log("✅ All files found");

console.log("🚀 Starting upload process...");

Promise.all(
  pageFiles.map(pagePath => {
    console.log(`📤 Uploading ${pagePath}...`);
    return toFile(fs.createReadStream(pagePath), undefined, { type: 'application/pdf' })
      .then(fileObj =>
        anthropic.beta.files.upload(
          { file: fileObj },
          { betas: ['files-api-2025-04-14'] }
        )
      )
      .then(result => {
        console.log(`✅ ${pagePath} uploaded successfully`);
        return result;
      })
      .catch(err => {
        console.error(`❌ Failed to upload ${pagePath}:`, err.message);
        throw err;
      });
  })
)
  .then(results => {
    console.log("🎉 All pages uploaded successfully!");
    console.log("📋 Upload results:", results.map((r, i) => ({ file: pageFiles[i], id: r.id })));
  })
  .catch(err => {
    console.error("💥 Error uploading one or more files:", err.message);
    process.exit(1);
  });
