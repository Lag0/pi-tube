// Providers report a detected language in different forms: Deepgram an ISO 639-1 code ("en"), Groq (Whisper) an
// English name ("Portuguese"), ElevenLabs an ISO 639-3 code ("por"). Saved transcripts and the cache use ISO 639-1.

/** Whisper's languages: ISO 639-1, English name, ISO 639-3. */
const LANGUAGES: ReadonlyArray<readonly [string, string, string]> = [
  ["en", "english", "eng"],
  ["zh", "chinese", "zho"],
  ["de", "german", "deu"],
  ["es", "spanish", "spa"],
  ["ru", "russian", "rus"],
  ["ko", "korean", "kor"],
  ["fr", "french", "fra"],
  ["ja", "japanese", "jpn"],
  ["pt", "portuguese", "por"],
  ["tr", "turkish", "tur"],
  ["pl", "polish", "pol"],
  ["ca", "catalan", "cat"],
  ["nl", "dutch", "nld"],
  ["ar", "arabic", "ara"],
  ["sv", "swedish", "swe"],
  ["it", "italian", "ita"],
  ["id", "indonesian", "ind"],
  ["hi", "hindi", "hin"],
  ["fi", "finnish", "fin"],
  ["vi", "vietnamese", "vie"],
  ["he", "hebrew", "heb"],
  ["uk", "ukrainian", "ukr"],
  ["el", "greek", "ell"],
  ["ms", "malay", "msa"],
  ["cs", "czech", "ces"],
  ["ro", "romanian", "ron"],
  ["da", "danish", "dan"],
  ["hu", "hungarian", "hun"],
  ["ta", "tamil", "tam"],
  ["no", "norwegian", "nor"],
  ["th", "thai", "tha"],
  ["ur", "urdu", "urd"],
  ["hr", "croatian", "hrv"],
  ["bg", "bulgarian", "bul"],
  ["lt", "lithuanian", "lit"],
  ["la", "latin", "lat"],
  ["mi", "maori", "mri"],
  ["ml", "malayalam", "mal"],
  ["cy", "welsh", "cym"],
  ["sk", "slovak", "slk"],
  ["te", "telugu", "tel"],
  ["fa", "persian", "fas"],
  ["lv", "latvian", "lav"],
  ["bn", "bengali", "ben"],
  ["sr", "serbian", "srp"],
  ["az", "azerbaijani", "aze"],
  ["sl", "slovenian", "slv"],
  ["kn", "kannada", "kan"],
  ["et", "estonian", "est"],
  ["mk", "macedonian", "mkd"],
  ["br", "breton", "bre"],
  ["eu", "basque", "eus"],
  ["is", "icelandic", "isl"],
  ["hy", "armenian", "hye"],
  ["ne", "nepali", "nep"],
  ["mn", "mongolian", "mon"],
  ["bs", "bosnian", "bos"],
  ["kk", "kazakh", "kaz"],
  ["sq", "albanian", "sqi"],
  ["sw", "swahili", "swa"],
  ["gl", "galician", "glg"],
  ["mr", "marathi", "mar"],
  ["pa", "punjabi", "pan"],
  ["si", "sinhala", "sin"],
  ["km", "khmer", "khm"],
  ["sn", "shona", "sna"],
  ["yo", "yoruba", "yor"],
  ["so", "somali", "som"],
  ["af", "afrikaans", "afr"],
  ["oc", "occitan", "oci"],
  ["ka", "georgian", "kat"],
  ["be", "belarusian", "bel"],
  ["tg", "tajik", "tgk"],
  ["sd", "sindhi", "snd"],
  ["gu", "gujarati", "guj"],
  ["am", "amharic", "amh"],
  ["yi", "yiddish", "yid"],
  ["lo", "lao", "lao"],
  ["uz", "uzbek", "uzb"],
  ["fo", "faroese", "fao"],
  ["ht", "haitian creole", "hat"],
  ["ps", "pashto", "pus"],
  ["tk", "turkmen", "tuk"],
  ["nn", "nynorsk", "nno"],
  ["mt", "maltese", "mlt"],
  ["sa", "sanskrit", "san"],
  ["lb", "luxembourgish", "ltz"],
  ["my", "myanmar", "mya"],
  ["bo", "tibetan", "bod"],
  ["tl", "tagalog", "tgl"],
  ["mg", "malagasy", "mlg"],
  ["as", "assamese", "asm"],
  ["tt", "tatar", "tat"],
  ["ln", "lingala", "lin"],
  ["ha", "hausa", "hau"],
  ["ba", "bashkir", "bak"],
  ["jw", "javanese", "jav"],
  ["su", "sundanese", "sun"],
];

const TO_ISO_639_1: ReadonlyMap<string, string> = new Map([
  ...LANGUAGES.flatMap(
    ([code, name, iso3]): Array<[string, string]> => [
      [name, code],
      [iso3, code],
    ],
  ),
  // Codes some providers use for languages above.
  ["cmn", "zh"],
  ["fil", "tl"],
  ["burmese", "my"],
]);

/**
 * A detected or requested language as a lowercase tag in ISO 639-1 where it can be: Whisper names and ISO 639-3
 * codes are translated, a region subtag is kept (`pt-BR` → `pt-br`), and anything unknown is only lowercased.
 */
export const normalizeLanguageTag = (value: string | undefined): string | undefined => {
  const tag = value?.trim().toLowerCase();
  if (!tag) return undefined;
  return TO_ISO_639_1.get(tag) ?? tag;
};

/** Whether two language tags name the same language, comparing primary subtags (`pt-br` and `pt` match). */
export const sameLanguage = (left: string | undefined, right: string | undefined): boolean => {
  const primary = (tag: string | undefined): string | undefined => normalizeLanguageTag(tag)?.split("-")[0];
  const leftPrimary = primary(left);
  return leftPrimary !== undefined && leftPrimary === primary(right);
};
