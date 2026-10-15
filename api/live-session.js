import {liveTokenHandler} from '../server/live-token.js';
const handler=liveTokenHandler({apiKey:process.env.GEMINI_API_KEY});
export default handler;
