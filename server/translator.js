const POS_TR = {
  noun: 'isim',
  verb: 'fiil',
  adjective: 'sıfat',
  adverb: 'zarf',
  pronoun: 'zamir',
  preposition: 'edat',
  conjunction: 'bağlaç',
  interjection: 'ünlem',
};

/**
 * Cleans up a raw selected word or phrase (trims quotes, brackets, trailing punctuation).
 */
function cleanWord(raw) {
  if (!raw || typeof raw !== 'string') return '';
  return raw
    .trim()
    .replace(/^[^a-zA-Z0-9']+|[^a-zA-Z0-9']+$/g, '')
    .trim();
}

/**
 * Translates English text to Turkish using Google Translate's GTX endpoint,
 * including dictionary breakdown (part of speech + multiple meanings) when translating single words.
 */
async function translateToTurkish(rawText, sentence = '') {
  const cleaned = cleanWord(rawText) || String(rawText || '').trim();
  if (!cleaned) {
    throw new Error('Çevrilecek metin boş.');
  }

  const url =
    'https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=tr&dt=t&dt=bd&q=' +
    encodeURIComponent(cleaned);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Çeviri servisi hatası: ${response.status}`);
  }

  const data = await response.json();

  // Primary translation from dt=t
  let translation = '';
  if (Array.isArray(data[0])) {
    translation = data[0].map((part) => (part && part[0]) || '').join('');
  }

  // Dictionary breakdown from dt=bd
  const alternatives = [];
  if (Array.isArray(data[1])) {
    for (const entry of data[1]) {
      const posEn = entry[0] || '';
      const pos = POS_TR[posEn.toLowerCase()] || posEn;
      const terms = Array.isArray(entry[1]) ? entry[1].slice(0, 5) : [];
      if (terms.length > 0) {
        alternatives.push({ pos, terms });
      }
    }
  }

  // If dictionary has a higher-frequency primary term, prefer showing it alongside primary translation
  let sentenceTranslation = '';
  const trimmedSentence = String(sentence || '').trim();
  if (trimmedSentence && trimmedSentence.toLowerCase() !== cleaned.toLowerCase()) {
    try {
      const sentUrl =
        'https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=tr&dt=t&q=' +
        encodeURIComponent(trimmedSentence);
      const sentRes = await fetch(sentUrl);
      if (sentRes.ok) {
        const sentData = await sentRes.json();
        if (Array.isArray(sentData[0])) {
          sentenceTranslation = sentData[0].map((p) => (p && p[0]) || '').join('');
        }
      }
    } catch {
      // Ignore sentence translation errors
    }
  }

  return {
    word: cleaned,
    translation: translation || (alternatives[0]?.terms[0] ?? ''),
    alternatives,
    sentence: trimmedSentence,
    sentenceTranslation,
  };
}

module.exports = { translateToTurkish, cleanWord };

