export const DEFAULT_VOICE_PREFERENCES = {
  enabled: false,
  voiceURI: '',
  rate: 0.93,
  pitch: 1.05,
};

export const spanishVoices = (voices = []) => voices.filter((voice) => /^es(?:-|$)/i.test(voice.lang || ''));

export const selectBestSpanishVoice = (voices = [], preferredURI = '') => {
  const candidates = spanishVoices(voices);
  if (!candidates.length) return null;
  return candidates.find((voice) => voice.voiceURI === preferredURI)
    || [...candidates].sort((left, right) => {
      const score = (voice) => {
        const name = `${voice.name} ${voice.voiceURI}`.toLowerCase();
        return (voice.lang?.toLowerCase() === 'es-bo' ? 300 : voice.lang?.toLowerCase() === 'es-es' ? 200 : 100)
          + (voice.localService ? 10 : 0)
          + (/(microsoft|google|natural|neural)/.test(name) ? 20 : 0);
      };
      return score(right) - score(left);
    })[0];
};

export const cleanDianaSpeech = (text) => String(text || '')
  .replace(/https?:\/\/\S+/gi, '')
  .replaceAll('{', '').replaceAll('}', '').replaceAll('[', '').replaceAll(']', '')
  .replace(/"(?:code|message|status|details)"\s*:/gi, '')
  .replace(/\s+/g, ' ')
  .trim();

export const speechSegments = (text, maximum = 3) => cleanDianaSpeech(text)
  .split(/(?<=[.!?])\s+/)
  .map((sentence) => sentence.trim())
  .filter(Boolean)
  .slice(0, maximum);
