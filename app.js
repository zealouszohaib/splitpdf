
import { Anthropic, toFile } from "@anthropic-ai/sdk";
import fs from 'fs';
import dotenv from "dotenv";


const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const anthropic = new Anthropic({
apiKey: ANTHROPIC_API_KEY,
timeout: 30 * 60 * 1000, 
});  


const results = [
    { file: 'fifty.pdf', id: 'file_011CUCchhG7PkDfiyvS1CspP' },
    { file: 'hundred.pdf', id: 'file_011CUCchZJeAzfiWdnZrNQKr' },
    { file: 'oneFifty.pdf', id: 'file_011CUCchXcgkj9RXa956vDst' },
    { file: 'end.pdf', id: 'file_011CUCchWirpGeA1FCSMYDE9' }
  ];

async function processFiles() {
  try {
    // Run all uploads in parallel
    const responses = await Promise.all(
      results.map(async (file) => {
        const response = await anthropic.beta.messages.create({
          model: "claude-sonnet-4-5",
          max_tokens: 1024,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `
                        You are a financial analyst specializing in corporate structure analysis. 
                        Your task is to extract parent-subsidiary relationships from the provided document section.

                        INSTRUCTIONS:
                        1. Carefully read through the document section.
                        2. Identify ALL companies mentioned with ownership/equity relationships.
                        3. Extract ONLY companies where a clear parent-subsidiary relationship exists.
                        4. For each relationship found, record:
                        - Parent company name (exactly as written)
                        - Subsidiary company name (exactly as written)
                        - Equity percentage (if mentioned, otherwise mark as "not specified")

                        OUTPUT FORMAT:
                        Return ONLY a JSON array with the following structure:
                        [
                        {
                            "parent": "Parent Company Name",
                            "subsidiary": "Subsidiary Company Name",
                            "equity": "percentage or 'not specified'"
                        }
                        ]

                        RULES:
                        - Include holding companies, SPVs, and intermediate entities.
                        - If Company A owns Company B which owns Company C, record both A→B and B→C relationships.
                        - Do not make assumptions about relationships not explicitly stated.
                        - Do not skip any companies mentioned with ownership relationships.
                        - If no relationships are found, return empty array.
                  `
                },
                {
                  type: "document",
                  source: {
                    type: "file",
                    file_id: file.id
                  }
                }
              ]
            }
          ],
          betas: ["files-api-2025-04-14"],
        });

        // Extract text safely
        const content = response.content?.[0]?.text || '';
        return content;
      })
    );

    // Combine all responses into one string
    const combinedResults = responses.join('\n');

    const msg = await anthropic.messages.create({
        model: "claude-sonnet-4-5",
        max_tokens: 50000,
      
        // ✅ put your system instructions here
        system: `You are a data consolidation specialist. You will receive 10 JSON arrays containing parent-subsidiary relationships extracted from different sections of the same document.
      
      YOUR TASK:
      1. Merge all relationships into a single comprehensive structure
      2. Remove exact duplicates
      3. Resolve conflicts (if same parent-subsidiary pair has different equity percentages, use the most specific/recent one)
      4. Build a hierarchical tree structure suitable for react-d3-tree visualization
      
      INPUT: 10 JSON arrays from previous extractions
      [Insert all 10 JSON results here]
      
      OUTPUT FORMAT:
      Create a nested JSON structure for react-d3-tree with this format:
      {json}
      {
        "name": "Ultimate Parent Company",
        "children": [
          {
            "name": "Subsidiary Name",
            "attributes": {
              "equity": "percentage"/ if
            },
            "children": [...]
          }
        ]
      }
      
      

      please provide the json only not the other text and also do not include any other text or comments or any other information 
      `,
      
        // ✅ only keep user message inside messages array
        messages: [
          {
            role: "user",
            content: combinedResults
          }
        ]
      });
      
    // ✅ Extract JSON text
    const jsonText = msg.content?.[0]?.text || "";

    try {
        // Clean and parse JSON safely
        const cleaned = msg.content[0].text
          .replace(/```json/g, '')
          .replace(/```/g, '')
          .trim();
      
        const jsonData = JSON.parse(cleaned);
      
        // ✅ Write parsed JSON to file
        const filePath = `output_${Date.now()}.json`;
        fs.writeFileSync(filePath, JSON.stringify(jsonData, null, 2), 'utf-8');
        console.log(`✅ JSON saved to ${filePath}`);
      } catch (error) {
        console.error('❌ Invalid JSON or file write error:', error);
        console.log('Raw text response:\n', msg.content[0].text);
      }
      
  } catch (err) {
    console.error('❌ Error uploading one or more files:', err);
  }
}

processFiles();
