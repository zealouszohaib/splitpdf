import { PDFDocument } from 'pdf-lib';
import fs from 'fs';
import { promises as fsPromises } from 'fs';
import Anthropic, { toFile } from '@anthropic-ai/sdk';
import path from 'path';

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


async function splitAndUploadPDF(inputPath, pagesPerFile = 50, onProgress) {
    try {
        // Read the original PDF file
        const existingPdfBytes = await fsPromises.readFile(inputPath);
        
        // Load the PDF document
        const pdfDoc = await PDFDocument.load(existingPdfBytes);
        
        // Get total number of pages
        const totalPages = pdfDoc.getPageCount();
        
        if (totalPages <= pagesPerFile) {
            // If PDF doesn't need splitting, upload as is
            const baseFilename = path.basename(inputPath, '.pdf');
            const uploadResult = await anthropic.beta.files.upload({
                file: await toFile(
                    Buffer.from(existingPdfBytes), 
                    `${baseFilename}.pdf`, 
                    { type: 'application/pdf' }
                )
            }, {
                betas: ['files-api-2025-04-14']
            });
            
            return {
                success: true,
                message: 'PDF uploaded without splitting (fewer pages than split size)',
                totalPages,
                totalFiles: 1,
                uploadedFiles: [{
                    fileId: uploadResult.id,
                    filename: uploadResult.filename,
                    startPage: 1,
                    endPage: totalPages,
                    pageCount: totalPages
                }]
            };
        }
        
        // Get the base filename without extension
        const baseFilename = path.basename(inputPath, '.pdf');
        
        // Array to store uploaded file information
        const uploadedFiles = [];
        
        // Calculate number of split files needed
        const totalFiles = Math.ceil(totalPages / pagesPerFile);
        
        // Split and upload PDFs
        for (let i = 0; i < totalFiles; i++) {
            // Create a new PDF document in memory
            const newPdf = await PDFDocument.create();
            
            // Calculate page range for this chunk
            const startPage = i * pagesPerFile;
            const endPage = Math.min(startPage + pagesPerFile, totalPages);
            
            // Copy pages to the new PDF
            const pagesToCopy = [];
            for (let pageNum = startPage; pageNum < endPage; pageNum++) {
                pagesToCopy.push(pageNum);
            }
            
            const copiedPages = await newPdf.copyPages(pdfDoc, pagesToCopy);
            
            // Add copied pages to the new PDF
            copiedPages.forEach(page => {
                newPdf.addPage(page);
            });
            
            // Generate filename for this chunk
            const outputFilename = `${baseFilename}_part_${i + 1}_pages_${startPage + 1}-${endPage}.pdf`;
            
            // Save the PDF to buffer instead of file
            const pdfBytes = await newPdf.save();
            const pdfBuffer = Buffer.from(pdfBytes);
            
            // Upload to Claude
            const uploadResult = await anthropic.beta.files.upload({
                file: await toFile(
                    pdfBuffer, 
                    outputFilename, 
                    { type: 'application/pdf' }
                )
            }, {
                betas: ['files-api-2025-04-14']
            });
            
            uploadedFiles.push({
                fileId: uploadResult.id,
                filename: outputFilename,
                originalFilename: uploadResult.filename,
                startPage: startPage + 1,
                endPage: endPage,
                pageCount: endPage - startPage,
                uploadedAt: uploadResult.created_at
            });
            
            // Call progress callback if provided
            if (onProgress) {
                onProgress({
                    current: i + 1,
                    total: totalFiles,
                    percentage: Math.round(((i + 1) / totalFiles) * 100),
                    currentFile: outputFilename,
                    fileId: uploadResult.id
                });
            }
            
            console.log(`Uploaded: ${outputFilename} (Pages ${startPage + 1}-${endPage}) - ID: ${uploadResult.id}`);
        }
        
        return {
            success: true,
            message: `Successfully split and uploaded PDF into ${totalFiles} files`,
            totalPages,
            totalFiles,
            pagesPerFile,
            uploadedFiles
        };
        
    } catch (error) {
        console.error('Error splitting and uploading PDF:', error);
        return {
            success: false,
            error: error.message,
            details: error.stack
        };
    }
}

/**
 * Split PDF buffer and upload directly to Claude (for when PDF is already in memory)
 * @param {Buffer} pdfBuffer - PDF file buffer
 * @param {string} originalFilename - Original filename for naming split files
 * @param {number} pagesPerFile - Number of pages per split file
 * @param {Function} onProgress - Optional progress callback
 * @returns {Promise<Object>} Object containing upload results with file IDs
 */
async function splitBufferAndUpload(pdfBuffer, originalFilename, pagesPerFile = 50, onProgress) {
    try {
        // Load the PDF document from buffer
        const pdfDoc = await PDFDocument.load(pdfBuffer);
        
        // Get total number of pages
        const totalPages = pdfDoc.getPageCount();
        
        if (totalPages <= pagesPerFile) {
            // If PDF doesn't need splitting, upload as is
            const uploadResult = await anthropic.beta.files.upload({
                file: await toFile(
                    pdfBuffer, 
                    originalFilename, 
                    { type: 'application/pdf' }
                )
            }, {
                betas: ['files-api-2025-04-14']
            });
            
            return {
                success: true,
                message: 'PDF uploaded without splitting',
                totalPages,
                totalFiles: 1,
                uploadedFiles: [{
                    fileId: uploadResult.id,
                    filename: uploadResult.filename,
                    startPage: 1,
                    endPage: totalPages,
                    pageCount: totalPages
                }]
            };
        }
        
        // Get the base filename without extension
        const baseFilename = path.basename(originalFilename, '.pdf');
        
        // Array to store uploaded file information
        const uploadedFiles = [];
        
        // Calculate number of split files needed
        const totalFiles = Math.ceil(totalPages / pagesPerFile);
        
        // Split and upload PDFs
        for (let i = 0; i < totalFiles; i++) {
            const newPdf = await PDFDocument.create();
            const startPage = i * pagesPerFile;
            const endPage = Math.min(startPage + pagesPerFile, totalPages);
            
            const pagesToCopy = [];
            for (let pageNum = startPage; pageNum < endPage; pageNum++) {
                pagesToCopy.push(pageNum);
            }
            
            const copiedPages = await newPdf.copyPages(pdfDoc, pagesToCopy);
            copiedPages.forEach(page => newPdf.addPage(page));
            
            const outputFilename = `${baseFilename}_part_${i + 1}_pages_${startPage + 1}-${endPage}.pdf`;
            
            const pdfBytes = await newPdf.save();
            const splitPdfBuffer = Buffer.from(pdfBytes);
            
            const uploadResult = await anthropic.beta.files.upload({
                file: await toFile(
                    splitPdfBuffer, 
                    outputFilename, 
                    { type: 'application/pdf' }
                )
            }, {
                betas: ['files-api-2025-04-14']
            });
            
            uploadedFiles.push({
                fileId: uploadResult.id,
                filename: outputFilename,
                originalFilename: uploadResult.filename,
                startPage: startPage + 1,
                endPage: endPage,
                pageCount: endPage - startPage,
                uploadedAt: uploadResult.created_at
            });
            
            if (onProgress) {
                onProgress({
                    current: i + 1,
                    total: totalFiles,
                    percentage: Math.round(((i + 1) / totalFiles) * 100),
                    currentFile: outputFilename,
                    fileId: uploadResult.id
                });
            }
        }
        
        return {
            success: true,
            message: `Successfully split and uploaded PDF into ${totalFiles} files`,
            totalPages,
            totalFiles,
            pagesPerFile,
            uploadedFiles
        };
        
    } catch (error) {
        console.error('Error splitting and uploading PDF:', error);
        return {
            success: false,
            error: error.message,
            details: error.stack
        };
    }
}

// Example usage
async function main() {
    try {
        // Example 1: Split and upload from file path
        console.log('Splitting and uploading PDF from file path...');
        const result = await splitAndUploadPDF(
            './simple.pdf',  // Input PDF path
            50,              // Pages per file
            (progress) => {
                console.log(`Progress: ${progress.percentage}% - Uploaded ${progress.currentFile} with ID: ${progress.fileId}`);
            }
        );
        
        if (result.success) {
            console.log('\nUpload successful!');
            console.log(`Created ${result.totalFiles} files from ${result.totalPages} pages`);
            console.log('\nUploaded file IDs:');
            result.uploadedFiles.forEach(file => {
                console.log(`- ${file.filename}: ID=${file.fileId}, Pages ${file.startPage}-${file.endPage}`);
            });
            
            // Return array of file IDs
            const fileIds = result.uploadedFiles.map(file => file.fileId);
            console.log('\nArray of file IDs:', fileIds);
            
            return fileIds;
        } else {
            console.error('Upload failed:', result.error);
        }
        
        // Example 2: If you already have a PDF buffer (e.g., from multer upload)
        // const pdfBuffer = await fsPromises.readFile('./simple.pdf');
        // const bufferResult = await splitBufferAndUpload(
        //     pdfBuffer,
        //     'document.pdf',
        //     50,
        //     (progress) => {
        //         console.log(`Progress: ${progress.percentage}%`);
        //     }
        // );
        
    } catch (error) {
        console.error('Error in main:', error);
    }
}

// Export the functions
export {
    splitAndUploadPDF,
    splitBufferAndUpload
};

// Run if this file is executed directly
    main().catch(console.error);
