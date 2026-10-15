export const ASSISTANT_ACTIONS=['search','profile','find_leads','set_location','set_quantity','show_more','filter','explain','compare','prepare_enquiry','save_lead','set_quotes','calculate','set_theme','set_language','read_results','help'];
export const assistantSchema={type:'object',properties:{action:{type:'string',enum:ASSISTANT_ACTIONS},description:{type:'string',nullable:true},country:{type:'string',nullable:true},city:{type:'string',nullable:true},state:{type:'string',nullable:true},quantity:{type:'number',nullable:true},lead_number:{type:'integer',nullable:true},theme:{type:'string',nullable:true},language:{type:'string',nullable:true},filter:{type:'string',nullable:true},disposal:{type:'number',nullable:true},buyer:{type:'number',nullable:true},transport:{type:'number',nullable:true},pretreatment:{type:'number',nullable:true}},required:['action','description','country','city','state','quantity','lead_number','theme','language','filter','disposal','buyer','transport','pretreatment']};
export function validateAssistantCommand(raw){
  if(!raw || !ASSISTANT_ACTIONS.includes(raw.action))throw new Error('That action is not supported. Please try a listed command.');
  const command={action:raw.action};
  for(const key of ['description','country','city','state','theme','language','filter'])if(typeof raw[key]==='string')command[key]=raw[key].slice(0,key==='description'?6000:160);
  for(const key of ['quantity','disposal','buyer','transport','pretreatment'])if(raw[key]!=null){
    if(typeof raw[key]!=='number' || !Number.isFinite(raw[key]) || Math.abs(raw[key])>1e9 || (key!=='buyer' && raw[key]<0))throw new Error('Please give a valid quantity or price.');
    command[key]=raw[key];
  }
  if(raw.lead_number!=null){if(!Number.isInteger(raw.lead_number) || raw.lead_number<1 || raw.lead_number>30)throw new Error('Choose a lead number from 1 to 30.');command.lead_number=raw.lead_number;}
  if(command.country && !/^[A-Z]{2}$/.test(command.country))throw new Error('Choose a country using its two-letter code.');
  if(command.theme && !['light','dark'].includes(command.theme))throw new Error('Choose light or dark mode.');
  if(command.language && !['en','hi','mr','es'].includes(command.language))throw new Error('Supported languages: English, Hindi, Marathi and Spanish.');
  if(command.filter && !['active','rejected','all'].includes(command.filter))throw new Error('Choose potential, excluded or all leads.');
  if(command.action==='search' && !command.description?.trim())throw new Error('The assistant did not identify the material. Repeat the request with the waste type and city; your previous brief has not been searched.');
  return command;
}
// Frequent interface commands do not need a model call.
export function localAssistantCommand(text){
  const value=text.trim().toLowerCase().replace(/[.!?]+$/,'');
  if(/^(switch to |use |set |turn on )?(light|dark)( mode| theme)?$/.test(value))return {action:'set_theme',theme:value.includes('light')?'light':'dark'};
  if(/^(show )?(more( leads)?|next( leads)?)$/.test(value))return {action:'show_more'};
  if(/^(find|show|search)( recovery)? leads$/.test(value))return {action:'find_leads'};
  if(/^(read|summarize)( the)? (results|leads)$/.test(value))return {action:'read_results'};
  if(/^(calculate|calculate value|recalculate)$/.test(value))return {action:'calculate'};
  if(/^(help|what can you do)$/.test(value))return {action:'help'};
  const lead=value.match(/^(explain|compare|save|prepare enquiry for) (?:lead |result )?(\d+)$/);
  if(lead)return validateAssistantCommand({action:{explain:'explain',compare:'compare',save:'save_lead','prepare enquiry for':'prepare_enquiry'}[lead[1]],lead_number:Number(lead[2])});
  return null;
}
