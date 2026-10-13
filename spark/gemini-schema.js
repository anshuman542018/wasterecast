import {MATERIAL_FAMILIES} from './materials.js';

export const profileSchema = {
  type:'object',
  properties:{
    family:{type:'string',enum:MATERIAL_FAMILIES},
    material_names:{type:'array',items:{type:'string'}},
    contaminants:{type:'array',items:{type:'string'}},
    hazard_indicated:{type:'boolean',nullable:true},
    moisture_pct:{type:'number',nullable:true},
    flash_point_c:{type:'number',nullable:true},
    quantity_tonnes_per_month:{type:'number',nullable:true},
    evidence:{type:'array',items:{type:'object',properties:{field:{type:'string'},quote:{type:'string'},source_name:{type:'string'},page:{type:'integer',nullable:true}},required:['field','quote','source_name']}},
    missing_facts:{type:'array',items:{type:'string'}},
    confidence:{type:'number'}
  },
  required:['family','material_names','contaminants','missing_facts','evidence','confidence']
};
export const shortlistSchema = {type:'object',properties:{assessments:{type:'array',items:{type:'object',properties:{facility_id:{type:'string'},triage:{type:'string',enum:['possible_lead','weak_evidence','documented_conflict']},route_hypothesis:{type:'string'},source_basis:{type:'string'},key_unknown:{type:'string'}},required:['facility_id','triage','route_hypothesis','source_basis','key_unknown']}}},required:['assessments']};
