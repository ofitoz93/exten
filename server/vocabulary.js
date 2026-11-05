const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const WORDS_PATH = path.join(__dirname, 'words.json');

function loadWords() {
  if (!fs.existsSync(WORDS_PATH)) {
    return [];
  }
  try {
    const data = JSON.parse(fs.readFileSync(WORDS_PATH, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function saveWordsToFile(words) {
  fs.writeFileSync(WORDS_PATH, JSON.stringify(words, null, 2), 'utf8');
}

/**
 * Adds or updates a word in words.json.
 * If the same English word (case-insensitive) already exists, updates its fields and moves it to the top.
 */
function saveWord({ word, translation, alternatives = [], sentence = '', sentenceTranslation = '', source = 'manual' }) {
  const clean = String(word || '').trim();
  if (!clean) {
    throw new Error('Kelime boş olamaz.');
  }

  const words = loadWords();
  const existingIndex = words.findIndex((w) => w.word.toLowerCase() === clean.toLowerCase());

  const now = new Date().toISOString();
  let entry;

  if (existingIndex !== -1) {
    const prev = words[existingIndex];
    entry = {
      ...prev,
      word: clean,
      translation: translation || prev.translation,
      alternatives: alternatives.length > 0 ? alternatives : prev.alternatives || [],
      sentence: sentence || prev.sentence || '',
      sentenceTranslation: sentenceTranslation || prev.sentenceTranslation || '',
      source: source || prev.source,
      count: (prev.count || 1) + 1,
      updatedAt: now,
    };
    words.splice(existingIndex, 1);
  } else {
    entry = {
      id: crypto.randomBytes(6).toString('hex'),
      word: clean,
      translation: String(translation || '').trim(),
      alternatives: Array.isArray(alternatives) ? alternatives : [],
      sentence: String(sentence || '').trim(),
      sentenceTranslation: String(sentenceTranslation || '').trim(),
      source,
      count: 1,
      createdAt: now,
      updatedAt: now,
    };
  }

  words.unshift(entry);
  saveWordsToFile(words);
  return { entry, words };
}

function deleteWord(id) {
  const words = loadWords();
  const filtered = words.filter((w) => w.id !== id);
  saveWordsToFile(filtered);
  return filtered;
}

function exportWordsCsv() {
  const words = loadWords();
  const escapeCsv = (val) => {
    const str = String(val ?? '').replace(/"/g, '""');
    return `"${str}"`;
  };

  const rows = [
    ['İngilizce', 'Türkçe Anlamı', 'Diğer Anlamlar', 'Örnek Cümle', 'Cümle Çevirisi', 'Tarih'].map(escapeCsv).join(','),
  ];

  for (const w of words) {
    const altText = (w.alternatives || [])
      .map((a) => `${a.pos}: ${(a.terms || []).join(', ')}`)
      .join(' | ');
    rows.push(
      [
        w.word,
        w.translation,
        altText,
        w.sentence || '',
        w.sentenceTranslation || '',
        w.createdAt || '',
      ]
        .map(escapeCsv)
        .join(',')
    );
  }

  // UTF-8 BOM so Excel opens Turkish characters properly
  return '\uFEFF' + rows.join('\r\n');
}

module.exports = {
  loadWords,
  saveWord,
  deleteWord,
  exportWordsCsv,
};

