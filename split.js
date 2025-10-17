import { PDFDocument } from 'pdf-lib';
import fs from 'fs';
import path from 'path';
import { promises as fsPromises } from 'fs';
/**
 * Split a large PDF into smaller PDFs with specified page count
 * @param {string} inputPath - Path to the input PDF file
 * @param {string} outputDir - Directory where split PDFs will be saved
 * @param {number} pagesPerFile - Number of pages per split file (default: 50)
 * @returns {Promise<Object>} Object containing split results
 */
async function splitPDF(inputPath, outputDir, pagesPerFile = 50) {
    try {
        // Read the PDF file
        const existingPdfBytes = await fsPromises.readFile(inputPath);

        // Load the PDF document
        const pdfDoc = await PDFDocument.load(existingPdfBytes);

        // Get total number of pages
        const totalPages = pdfDoc.getPageCount();

        if (totalPages <= pagesPerFile) {
            return {
                success: true,
                message: 'PDF has fewer pages than split size. No splitting needed.',
                totalPages,
                files: []
            };
        }

        // Create output directory if it doesn't exist
        await fsPromises.mkdir(outputDir, { recursive: true });

        // Get the base filename without extension
        const baseFilename = path.basename(inputPath, '.pdf');

        // Array to store created file names
        const createdFiles = [];

        // Calculate number of split files needed
        const totalFiles = Math.ceil(totalPages / pagesPerFile);

        // Split the PDF
        for (let i = 0; i < totalFiles; i++) {
            // Create a new PDF document
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
            const outputPath = path.join(outputDir, outputFilename);

            // Save the new PDF
            const pdfBytes = await newPdf.save();
            await fsPromises.writeFile(outputPath, pdfBytes);

            createdFiles.push({
                filename: outputFilename,
                path: outputPath,
                startPage: startPage + 1,
                endPage: endPage,
                pageCount: endPage - startPage
            });

            console.log(`Created: ${outputFilename} (Pages ${startPage + 1}-${endPage})`);
        }

        return {
            success: true,
            message: `Successfully split PDF into ${totalFiles} files`,
            totalPages,
            totalFiles,
            pagesPerFile,
            files: createdFiles
        };

    } catch (error) {
        console.error('Error splitting PDF:', error);
        return {
            success: false,
            error: error.message,
            details: error.stack
        };
    }
}

/**
 * Split PDF with progress callback
 * @param {string} inputPath - Path to the input PDF file
 * @param {string} outputDir - Directory where split PDFs will be saved
 * @param {number} pagesPerFile - Number of pages per split file
 * @param {Function} onProgress - Callback function for progress updates
 */
async function splitPDFWithProgress(inputPath, outputDir, pagesPerFile = 50, onProgress) {
    try {
        const existingPdfBytes = await fsPromises.readFile(inputPath);
        const pdfDoc = await PDFDocument.load(existingPdfBytes);
        const totalPages = pdfDoc.getPageCount();

        if (totalPages <= pagesPerFile) {
            return {
                success: true,
                message: 'PDF has fewer pages than split size. No splitting needed.',
                totalPages,
                files: []
            };
        }

        await fsPromises.mkdir(outputDir, { recursive: true });

        const baseFilename = path.basename(inputPath, '.pdf');
        const createdFiles = [];
        const totalFiles = Math.ceil(totalPages / pagesPerFile);

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
            const outputPath = path.join(outputDir, outputFilename);

            const pdfBytes = await newPdf.save();
            await fsPromises.writeFile(outputPath, pdfBytes);

            createdFiles.push({
                filename: outputFilename,
                path: outputPath,
                startPage: startPage + 1,
                endPage: endPage,
                pageCount: endPage - startPage
            });

            // Call progress callback if provided
            if (onProgress) {
                onProgress({
                    current: i + 1,
                    total: totalFiles,
                    percentage: Math.round(((i + 1) / totalFiles) * 100),
                    currentFile: outputFilename
                });
            }
        }

        return {
            success: true,
            message: `Successfully split PDF into ${totalFiles} files`,
            totalPages,
            totalFiles,
            pagesPerFile,
            files: createdFiles
        };

    } catch (error) {
        console.error('Error splitting PDF:', error);
        return {
            success: false,
            error: error.message,
            details: error.stack
        };
    }
}

// Example usage
async function main() {
    // Basic usage
    const result = await splitPDF(
        './simple.pdf',  // Input PDF path
        './output',                     // Output directory
        50                              // Pages per file
    );

    if (result.success) {
        console.log('Split successful!');
        console.log(`Created ${result.totalFiles} files from ${result.totalPages} pages`);
        result.files.forEach(file => {
            console.log(`- ${file.filename}: Pages ${file.startPage}-${file.endPage}`);
        });
    } else {
        console.error('Split failed:', result.error);
    }

    // Usage with progress callback
    console.log('\n--- Splitting with progress tracking ---');
    const resultWithProgress = await splitPDFWithProgress(
        './input/another-large.pdf',
        './output',
        50,
        (progress) => {
            console.log(`Progress: ${progress.percentage}% - Processing file ${progress.current}/${progress.total}`);
        }
    );

    console.log('Result:', resultWithProgress);
}

// Export the functions
export {
    splitPDF,
    splitPDFWithProgress
};

// Run the main function when this script is executed directly
main().catch(console.error);
