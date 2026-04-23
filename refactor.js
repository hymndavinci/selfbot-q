const fs = require('fs');

let content = fs.readFileSync('index.js', 'utf8');

// Remove old QuestState class (line ~35 to ~251)
const stateClassStart = content.indexOf('// ============================================\n// STATE MANAGEMENT\n// ============================================\nclass QuestState {');
const stateClassEnd = content.indexOf('const state = new QuestState();\n\n// ============================================\n// API CLIENT');
if (stateClassStart !== -1 && stateClassEnd !== -1) {
    content = content.slice(0, stateClassStart) + content.slice(stateClassEnd + 'const state = new QuestState();\n\n'.length);
}

// Remove old APIClient class
const apiClassStart = content.indexOf('// ============================================\n// API CLIENT\n// ============================================\nclass APIClient {');
const apiClassEnd = content.indexOf('const api = new APIClient();\n\n// ============================================\n// DISCORD CLIENT');
if (apiClassStart !== -1 && apiClassEnd !== -1) {
    content = content.slice(0, apiClassStart) + content.slice(apiClassEnd + 'const api = new APIClient();\n\n'.length);
}

// Remove old client creation
const clientStart = content.indexOf('// ============================================\n// DISCORD CLIENT\n// ============================================\nconst client = new Client({');
const clientEnd = content.indexOf('});\n\n// ============================================\n// EMBED BUILDERS');
if (clientStart !== -1 && clientEnd !== -1) {
    content = content.slice(0, clientStart) + content.slice(clientEnd + '});\n\n'.length);
}

// Remove old normalizeQuest, qName, qGame
const normStart = content.indexOf('// Helper: normalize quest dari dua kemungkinan struktur API:');
const normEnd = content.indexOf('function qGame(quest) {\n    const n = normalizeQuest(quest);\n    return n.game || n.game_name || \'\';\n}\n\nfunction buildQuestEmbed');
if (normStart !== -1 && normEnd !== -1) {
    content = content.slice(0, normStart) + content.slice(normEnd + "function qGame(quest) {\n    const n = normalizeQuest(quest);\n    return n.game || n.game_name || '';\n}\n\n".length);
}

// Remove old generateQuestCardImage and roundRect
const cardStart = content.indexOf('// ============================================\n// QUEST CARD IMAGE GENERATOR (like Questor)\n// ============================================\n\nasync function generateQuestCardImage');
const cardEnd = content.indexOf('function roundRect(ctx, x, y, w, h, r) {');
const roundRectEnd = content.indexOf('}\n\nasync function buildQuestEmbedMonitor');
if (cardStart !== -1 && roundRectEnd !== -1) {
    content = content.slice(0, cardStart) + content.slice(roundRectEnd + '}\n\n'.length);
}

fs.writeFileSync('index.js', content);
console.log('Refactored index.js');
