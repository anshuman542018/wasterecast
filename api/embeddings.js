import {embeddingsHandler} from '../server/embeddings.js';
export default embeddingsHandler({apiKey:process.env.GEMINI_API_KEY});
