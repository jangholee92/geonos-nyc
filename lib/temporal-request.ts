/** A new, explicit historical-source request; never a retry route after refusal. */
export function temporalImageryIntent(question:string):boolean{
 if(typeof question!=='string'||question.length>4000)return false;
 const q=question.toLowerCase();
 if(/\b(?:do not|don't|never|without|bypass|circumvent|filtered|blocked|refused|refusal)\b/.test(q))return false;
 return /\b(?:aerial|imagery|images|photos|photographs|dino(?:v2)?)\b/.test(q)&&/\b(?:past|historical|history|time|2020|2024|change|changed|changes|before|after|older)\b/.test(q)&&/\b(?:compare|show|inspect|check|analy[sz]e|find|use|explore|look)\b/.test(q);
}
export const temporalImageryTool={type:'function',function:{name:'inspect_imagery_history',description:'Terminal historical aerial-image request for one selected or this-turn retrieved native building. Retrieves official Spring2020 andSpring2024 source images at identical bounds. The UI offers actual on-device Meta DINOv2 feature comparison after the user chooses Run; do not claim DINOv2 has already run. Only these two years are supported; state them explicitly. Pixel registration is unverified. No current image, verified physical change, condition, risk or resilience score is returned. Requires explicit current request for historical/over-time imagery; never refusal recovery.',parameters:{type:'object',properties:{id:{type:'string'}},required:['id'],additionalProperties:false}}};
