// Firebase AI Logic's Gemini Developer API proxy. The Firebase browser key
// identifies this app; the Gemini credential stays managed by Google.
const responseCache = new Map();
const quotaCooldowns = new Map();
export async function generateWithFirebase({projectId, apiKey, appId, appCheckToken, model, content, schema, thinkingLevel = 'low', fallbackModel = 'gemini-3.5-flash-lite', timeoutMs = 60000, retryDelayMs = 2000, useCache = true, onStatus = () => {}, transport = null}) {
  const body = {
    contents: [{role:'user', parts: content.map(part => typeof part === 'string' ? {text:part} : part)}],
    generationConfig: {thinkingConfig:{thinkingLevel},maxOutputTokens:4096,
      ...(schema ? {responseMimeType:'application/json',responseSchema:schema} : {})}
  };
  const cacheKey = useCache && globalThis.crypto?.subtle
    ? Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({projectId,model,body})))),byte=>byte.toString(16).padStart(2,'0')).join('') : null;
  if (cacheKey && responseCache.has(cacheKey)) { onStatus('Using the previous Gemini result for this input.'); return responseCache.get(cacheKey); }
  const deadline = Date.now() + timeoutMs;
  let timer;
  try {
    let data;
    const primaryOnCooldown = (quotaCooldowns.get(`${projectId}:${model}`) || 0) > Date.now();
    const models = primaryOnCooldown ? [fallbackModel] : [model,fallbackModel];
    for (let attempt = 0; attempt < models.length; attempt++) {
      const activeModel = models[attempt];
      const url = `https://firebasevertexai.googleapis.com/v1beta/projects/${encodeURIComponent(projectId)}/models/${encodeURIComponent(activeModel)}:generateContent`;
      // A network failure or timeout is not retried: its outcome is unknown.
      const result = await Promise.race([
        (async () => {
          const response = transport ? await transport(activeModel,body) : await fetch(url, {method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':apiKey,
            'X-Firebase-AppCheck':appCheckToken,'X-Firebase-Appid':appId},body:JSON.stringify(body)});
          return {response,data:await response.json()};
        })(),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Gemini took longer than 60 seconds. Please retry.')), Math.max(1,deadline - Date.now())); })
      ]);
      clearTimeout(timer);
      data = result.data;
      if (result.response.ok) break;
      if (result.response.status === 429) {
        const retryInfo = data.error?.details?.find(detail=>String(detail['@type']).endsWith('RetryInfo'));
        const delaySeconds = parseFloat(retryInfo?.retryDelay || '') || 300;
        quotaCooldowns.set(`${projectId}:${activeModel}`,Date.now() + delaySeconds * 1000);
      }
      if (attempt === 0 && models.length > 1 && [429,500,503].includes(result.response.status) && Date.now() + retryDelayMs < deadline) {
        onStatus(result.response.status === 429 ? 'The primary Gemini model reached its free quota. Trying the backup Gemini model…' : 'Gemini is temporarily busy. Trying the backup Gemini model…');
        await new Promise(resolve => setTimeout(resolve,retryDelayMs));
        continue;
      }
      if (result.response.status === 429) throw new Error('The available free Gemini quota has been reached. Please try again after the quota resets, or use manual screening.');
      throw new Error(`Gemini request failed (${result.response.status}): ${data.error?.message || result.response.statusText}`);
    }
    const candidate = data.candidates?.[0];
    if (!candidate) throw new Error(`Gemini returned no material profile${data.promptFeedback?.blockReason ? ': ' + data.promptFeedback.blockReason : '.'}`);
    if (candidate.finishReason && candidate.finishReason !== 'STOP') throw new Error(`Gemini could not complete the response (${candidate.finishReason}). Try a shorter description.`);
    const result = (candidate.content?.parts || []).filter(part=>typeof part.text === 'string' && !part.thought).map(part=>part.text).join('');
    if (!result.trim()) throw new Error('Gemini returned an empty response. Please retry.');
    if (cacheKey) {
      if (responseCache.size >= 12) responseCache.delete(responseCache.keys().next().value);
      responseCache.set(cacheKey,result);
    }
    onStatus('Gemini connected · response received.');
    return result;
  } catch (error) {
    if (error instanceof TypeError) throw new Error('This browser could not reach Google’s Gemini service. Check your connection and retry in Chrome or Edge.');
    throw error;
  } finally { clearTimeout(timer); }
}
