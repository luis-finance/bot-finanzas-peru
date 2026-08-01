const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(__dirname, 'config.json');
const conf = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
const apiKey = conf.api_key;

console.log('Testing key:', apiKey ? apiKey.substring(0, 8) + '...' : 'NONE');

const modelsToTest = [
    'gemini-1.5-flash-latest',
    'gemini-1.5-flash',
    'gemini-2.0-flash',
    'gemini-1.5-pro',
    'gemini-1.5-pro-latest'
];

async function testModels() {
    const genAI = new GoogleGenerativeAI(apiKey);
    for (const modelName of modelsToTest) {
        try {
            console.log(`Testing model: ${modelName}...`);
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent("Hola, responde 'OK'");
            console.log(`SUCCESS for ${modelName}:`, result.response.text());
        } catch (e) {
            console.error(`FAILED for ${modelName}:`, e.message);
        }
    }
}

testModels();
